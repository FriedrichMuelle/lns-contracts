pragma solidity >=0.8.4;

import "./NFTPriceOracle.sol";
import "./SafeMath.sol";
import "./StringUtils.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";

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
contract NFTNativePriceOracle is Ownable, NFTPriceOracle {
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
    bytes4 constant public NFT_ORACLE_ID = bytes4(keccak256("price(string,uint256,uint256,address)") ^
                                                  keccak256("getNamePriceBreakdown(string,uint256,uint256,address)")); // 0x852ae872

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

    function countNFTs(address target) public view returns (uint) {
        if (target == address(0)) {
            return 0;
        }

        uint totalBalance = 0;
        for (uint256 i = 0; i < nftCollectionsEligibleForDiscount.length; i++) {
            totalBalance += IERC721(nftCollectionsEligibleForDiscount[i]).balanceOf(target);
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
        return basePrice;
    }

    function getDiscountedPrice(uint basePrice, address target) public view returns(uint) {
        return getDiscountedPrice(basePrice, countNFTs(target));
    }

    function getDiscountedPrice(uint basePrice, uint nftAmount) private view returns(uint) {
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

    function price(string calldata name, uint expires, uint duration, address target) external view override returns(uint) {
        uint nftAmount = countNFTs(target);
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

    function getNamePriceBreakdown(string calldata name, uint expires, uint duration, address target)
        public
        view
        returns (PriceBreakdown memory priceBreakdown)
    {
        uint nftAmount = countNFTs(target);
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
        return interfaceID == INTERFACE_META_ID || interfaceID == NFT_ORACLE_ID;
    }
}
