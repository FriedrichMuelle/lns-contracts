pragma solidity >=0.8.4;

import "./PriceOracle.sol";
import "./BaseRegistrarImplementation.sol";
import "./StringUtils.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "../resolvers/Resolver.sol";

/**
 * @dev A registrar controller for registering and renewing names at zero cost restricted to owner only.
 */
contract PromoETHRegistrarController is Ownable {
    using StringUtils for *;

    bytes4 constant private INTERFACE_META_ID = bytes4(keccak256("supportsInterface(bytes4)"));

    BaseRegistrarImplementation base;

    event NameRegistered(string name, bytes32 indexed label, address indexed owner, uint cost, uint expires);
    event NameRenewed(string name, bytes32 indexed label, uint cost, uint expires);

    constructor(BaseRegistrarImplementation _base) {
        base = _base;
    }

    function valid(string memory name) public pure returns(bool) {
        return name.strlen() >= 1;
    }

    function available(string memory name) public view returns(bool) {
        bytes32 label = keccak256(bytes(name));
        return valid(name) && base.available(uint256(label));
    }

    function register(string calldata name, address owner, uint duration, bytes32 secret) external payable {
        require(tx.origin == this.owner(), "Ownable: caller is not the owner");
        registerWithConfig(name, owner, duration, secret, address(0), address(0));
    }

    function registerWithConfig(string memory name, address owner, uint duration, bytes32 secret, address resolver, address addr) public payable {
        require(tx.origin == this.owner(), "Ownable: caller is not the owner");
        (secret);
        bytes32 label = keccak256(bytes(name));
        uint256 tokenId = uint256(label);

        uint expires;
        if(resolver != address(0)) {
            // Set this contract as the (temporary) owner, giving it
            // permission to set up the resolver.
            expires = base.register(tokenId, address(this), duration);

            // The nodehash of this label
            bytes32 nodehash = keccak256(abi.encodePacked(base.baseNode(), label));

            // Set the resolver
            base.ens().setResolver(nodehash, resolver);

            // Configure the resolver
            if (addr != address(0)) {
                Resolver(resolver).setAddr(nodehash, addr);
            }

            // Now transfer full ownership to the expeceted owner
            base.reclaim(tokenId, owner);
            base.transferFrom(address(this), owner, tokenId);
        } else {
            require(addr == address(0));
            expires = base.register(tokenId, owner, duration);
        }

        emit NameRegistered(name, label, owner, 0, expires);

        // Refund any extra payment
        if(msg.value > 0) {
            payable(msg.sender).transfer(msg.value);
        }
    }

    function renew(string calldata name, uint duration) external payable {
        require(tx.origin == this.owner(), "Ownable: caller is not the owner");

        bytes32 label = keccak256(bytes(name));
        uint expires = base.renew(uint256(label), duration);

        if(msg.value > 0) {
            payable(msg.sender).transfer(msg.value);
        }

        emit NameRenewed(name, label, 0, expires);
    }

    function withdraw() public {
        payable(owner()).transfer(address(this).balance);
    }

    function supportsInterface(bytes4 interfaceID) external pure returns (bool) {
        return interfaceID == INTERFACE_META_ID;
    }
}
