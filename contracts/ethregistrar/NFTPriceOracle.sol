pragma solidity >=0.8.4;

import "./PriceOracle.sol";

interface NFTPriceOracle {
    /**
     * @dev Returns the price to register or renew a name.
     * @param name The name being registered or renewed.
     * @param expires When the name presently expires (0 if this is a new registration).
     * @param duration How long the name is being registered or extended for, in seconds.
     * @param target Target address to get the (discounted) price for.
     * @return The price of this renewal or registration, in wei.
     */
    function price(string calldata name, uint expires, uint duration, address target) external view returns(uint);
}
