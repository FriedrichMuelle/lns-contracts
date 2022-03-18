pragma solidity >=0.8.4;
pragma experimental ABIEncoderV2;

import "../registry/ENS.sol";
import "./ETHRegistrarController.sol";
import "../resolvers/Resolver.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract RegisterHelper is Ownable {
    ENS public ens;
    Resolver public resolver;
    ETHRegistrarController public controller;

    constructor(ENS _ens, Resolver _resolver, ETHRegistrarController _controller) {
        ens = _ens;
        resolver = _resolver;
        controller = _controller;
    }

    function _register(string calldata name, bytes32 namehash, uint duration, address addr) internal onlyOwner {
        require(controller.rentPrice(name, duration) == 0, "Rent price must be 0");
        require(controller.minCommitmentAge() == 0, "Controller's min commitment age must be 0");
        require(ens.recordExists(namehash) == false, "Record exists");

        bytes32 secret = hex"0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF";
        bytes32 commitment = controller.makeCommitmentWithConfig(name, msg.sender, secret, address(resolver), addr);
        controller.commit(commitment);
        controller.registerWithConfig(name, msg.sender, duration, secret, address(resolver), addr);
    }

    function register(string calldata name, bytes32 namehash, uint duration, address addr) external payable onlyOwner {
        _register(name, namehash, duration, addr);
    }

    function registerMany(string[] calldata names, bytes32[] calldata namehashes, uint[] calldata durations, address[] calldata addrs) external payable onlyOwner {
        uint arrayLength = names.length;
        for (uint i=0; i<arrayLength; i++) {
            _register(names[i], namehashes[i], durations[i], addrs[i]);
        }
    }
}