pragma solidity >=0.8.4;
pragma experimental ABIEncoderV2;

import "../registry/ENS.sol";
import "./PromoETHRegistrarController.sol";
import "./NativePriceOracle.sol";
import "../resolvers/Resolver.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract PromoRegisterHelper is Ownable {
    ENS public ens;
    Resolver public resolver;
    PromoETHRegistrarController public controller;

    constructor(ENS _ens, Resolver _resolver, PromoETHRegistrarController _controller) {
        ens = _ens;
        resolver = _resolver;
        controller = _controller;
    }

    function _register(string calldata name, bytes32 namehash, uint duration, address addr, address owner) internal onlyOwner {
        if (ens.recordExists(namehash)) {
            return;
        }

        bytes32 secret = hex"0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF";
        controller.registerWithConfig(name, owner, duration, secret, address(resolver), addr);
    }

    function register(string calldata name, bytes32 namehash, uint duration, address addr, address owner) external payable onlyOwner {
        _register(name, namehash, duration, addr, owner);
    }

    function registerMany(string[] calldata names, bytes32[] calldata namehashes, uint[] calldata durations, address[] calldata addrs, address[] calldata owners) external payable onlyOwner {
        for (uint i=0; i<names.length; i++) {
            _register(names[i], namehashes[i], durations[i], addrs[i], owners[i]);
        }
    }
}