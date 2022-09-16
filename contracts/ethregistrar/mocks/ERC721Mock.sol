pragma solidity >=0.8.4;

import "@openzeppelin/contracts/token/ERC721/presets/ERC721PresetMinterPauserAutoId.sol";

import "@openzeppelin/contracts/utils/Counters.sol";


contract ERC721Mock is ERC721PresetMinterPauserAutoId {
    using Counters for Counters.Counter;
    Counters.Counter private _tokenIdTracker;

    constructor(
        string memory name,
        string memory symbol
    ) ERC721PresetMinterPauserAutoId(name, symbol, "") {}

    // allow anyone to mint
    function mint(address to) public override {
        _mint(to, _tokenIdTracker.current());
        _tokenIdTracker.increment();
    }
}
