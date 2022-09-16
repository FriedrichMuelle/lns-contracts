pragma solidity >=0.8.4;

import "./PriceOracle.sol";
import "./SafeMath.sol";
import "./StringUtils.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "hardhat/console.sol";

struct PriceBreakdown {
    uint256 basePrice;
    uint256 discountedPrice;
    uint nftAmount;
    uint requiredNftAmount;
    bool isEligibleForDiscount;
    bool canRegisterName;
    address[] collections;
    uint256[] discounts;
}

// NFTNativePriceOracle can be configured to provide discounts to the users holding certain NFTS.
// Also can be configured to require the NFT to allow registrations
contract NFTNativePriceOracle is Ownable, PriceOracle {
    using SafeMath for *;
    using StringUtils for *;

    error CollectionAlreadyEligible();
    error CollectionNotEligible();
    error NotEnoughRequiredNFTs();

    event RentPriceChanged(uint[] prices);
    event RentDiscountChanged(uint[] discounts);
    event CollectionAdded(address collectionAddress);
    event CollectionRemoved(address collectionAddress);
    event RequiredNFTAmoutChanged(uint nftAmount);

    // Rent in base price units by length. Element 0 is for 1-length names, and so on.
    uint[] public rentPrices;
    function getRentPrices() public view returns(uint[] memory) {
        return rentPrices;
    }

    // Discounts in 0.1 percent points for holding 1,2,3,4 etc nfts, 10 = equals 1%, 15 - 1.5%
    uint[] public discounts;
    function getDiscounts() public view returns(uint[] memory) {
        return discounts;
    }

    // List of ERC721-compatible NFTs to be checked in user's possesion to provide them a discount
    address[] public nftCollectionsEligibleForDiscount;
    function getNftCollectionsEligibleForDiscount() public view returns(address[] memory) {
        return nftCollectionsEligibleForDiscount;
    }

    // Require at least `requiredNFTs` NFT to register a domain
    uint public requiredNFTs;

    bytes4 constant public INTERFACE_META_ID = bytes4(keccak256("supportsInterface(bytes4)"));
    bytes4 constant public ORACLE_ID = bytes4(keccak256("price(string,uint256,uint256)") ^
                                              keccak256("premium(string,uint256,uint256)"));
    bytes4 constant public NFT_ORACLE_ID = bytes4(keccak256("getDiscountedPrice(uint256)") ^
                                                  keccak256("addEligibleCollection(address)"));

    constructor(uint[] memory _rentPrices, uint[] memory _discounts) {
        setPrices(_rentPrices);
        setDiscounts(_discounts);
    }

    // Add an ERC721 contract eligible for discount
    function addEligibleCollection(address collection) public onlyOwner {
        for (uint256 i = 0; i < nftCollectionsEligibleForDiscount.length; i++) {
            if (nftCollectionsEligibleForDiscount[i] == collection) {
                revert CollectionAlreadyEligible();
            }
        }

        nftCollectionsEligibleForDiscount.push(collection);
        emit CollectionAdded(collection);
    }

    // Remove an ERC721 contract from list of eligible for discount
    function removeEligibleCollection(address collection) public onlyOwner {
        for (uint256 i = 0; i < nftCollectionsEligibleForDiscount.length; i++) {
            if (nftCollectionsEligibleForDiscount[i] == collection) {
                nftCollectionsEligibleForDiscount[i] = nftCollectionsEligibleForDiscount[
                    nftCollectionsEligibleForDiscount.length - 1
                ];
                nftCollectionsEligibleForDiscount.pop();
                emit CollectionRemoved(collection);
                return;
            }
        }

        revert CollectionNotEligible();
    }

    function countNFTs() public view returns (uint) {
        if (tx.origin == address(0)) {
            return 0;
        }

        uint totalBalance = 0;
        for (uint256 i = 0; i < nftCollectionsEligibleForDiscount.length; i++) {
            totalBalance += IERC721(nftCollectionsEligibleForDiscount[i]).balanceOf(tx.origin);
        }
        return totalBalance;
    }

    function isEligibleForDiscount(uint nftAmount) public pure returns (bool) {
        return nftAmount > 0;
    }

    function canRegister(uint nftAmount) public view returns (bool) {
        if (requiredNFTs == 0) {
            return true;
        }

        if (nftAmount >= requiredNFTs) {
            return true;
        }
        return false;
    }

    function setRequiredNFTs(uint nftAmount) public onlyOwner {
        requiredNFTs = nftAmount;
        emit RequiredNFTAmoutChanged(nftAmount);
    }

    function getBasePrice(string calldata name, uint expires, uint duration) public view returns(uint) {
        uint len = name.strlen();
        if(len > rentPrices.length) {
            len = rentPrices.length;
        }
        require(len > 0);

        uint basePrice = rentPrices[len - 1].mul(duration);
        basePrice = basePrice.add(_premium(name, expires, duration));
        return basePrice;
    }

    function getDiscountedPrice(uint basePrice) public view returns(uint) {
        return getDiscountedPrice(basePrice, countNFTs());
    }

    function getDiscountedPrice(uint basePrice, uint nftAmount) public view returns(uint) {
        bool eligible = isEligibleForDiscount(nftAmount);

        if (nftAmount > discounts.length) {
            nftAmount = discounts.length;
        }

        if (eligible && nftAmount > 0) {
            uint discount = discounts[nftAmount-1];
            basePrice = basePrice.mul(1000 - discount).div(1000);
        }

        return basePrice;
    }

    function price(string calldata name, uint expires, uint duration) external view override returns(uint) {
        uint nftAmount = countNFTs();
        if (!canRegister(nftAmount)) {
            revert NotEnoughRequiredNFTs();
        }

        uint basePrice = getBasePrice(name, expires, duration);
        basePrice = getDiscountedPrice(basePrice, nftAmount);
        return basePrice;
    }

    /**
     * @dev Sets rent prices.
     * @param _rentPrices The price array. Each element corresponds to a specific
     *                    name length; names longer than the length of the array
     *                    default to the price of the last element. Values are
     *                    in base price units per second, equal to one wei (1e-18
     *                    ETH) each.
     */
    function setPrices(uint[] memory _rentPrices) public onlyOwner {
        rentPrices = _rentPrices;
        emit RentPriceChanged(_rentPrices);
    }

    /**
     * @dev Sets discount prices.
     * @param _discounts The price array. Each element corresponds to a specific
     *                    name length; names longer than the length of the array
     *                    default to the price of the last element. Values are
     *                    in base price units per second, equal to one wei (1e-18
     *                    ETH) each.
     */
    function setDiscounts(uint[] memory _discounts) public onlyOwner {
        discounts = _discounts;
        emit RentDiscountChanged(_discounts);
    }

    /**
     * @dev Returns the pricing premium in internal base units.
     */
    function _premium(string memory name, uint expires, uint duration) virtual internal view returns(uint) {
        return 0;
    }

    function getNamePriceBreakdown(string calldata name, uint expires, uint duration)
        public
        view
        returns (PriceBreakdown memory priceBreakdown)
    {
        uint nftAmount = countNFTs();
        priceBreakdown.basePrice = getBasePrice(name, expires, duration);
        priceBreakdown.discountedPrice = getDiscountedPrice(priceBreakdown.basePrice, nftAmount);
        priceBreakdown.nftAmount = nftAmount;
        priceBreakdown.requiredNftAmount = requiredNFTs;
        priceBreakdown.isEligibleForDiscount = isEligibleForDiscount(nftAmount);
        priceBreakdown.canRegisterName = canRegister(nftAmount);
        priceBreakdown.collections = nftCollectionsEligibleForDiscount;
        priceBreakdown.discounts = discounts;
    }

    function supportsInterface(bytes4 interfaceID) public view virtual returns (bool) {
        return interfaceID == INTERFACE_META_ID || interfaceID == ORACLE_ID || interfaceID == NFT_ORACLE_ID;
    }
}
