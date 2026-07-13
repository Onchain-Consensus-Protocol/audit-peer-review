// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Script.sol";
import "../src/AuditReviewVaultFactory.sol";

contract DeployBaseSepolia is Script {
    address internal constant BASE_SEPOLIA_USDC = 0x036CbD53842c5426634e7929541eC2318f3dCF7e;
    uint256 internal constant MIN_STAKE = 1_000_000;
    uint256 internal constant MIN_CREATOR_NO_STAKE = 10_000_000;

    function run() external returns (AuditReviewVaultFactory factory) {
        require(block.chainid == 84532, "Base Sepolia only");
        require(BASE_SEPOLIA_USDC.code.length > 0, "USDC not deployed");
        uint256 privateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(privateKey);
        factory = new AuditReviewVaultFactory(BASE_SEPOLIA_USDC, MIN_STAKE, MIN_CREATOR_NO_STAKE);
        vm.stopBroadcast();
    }
}
