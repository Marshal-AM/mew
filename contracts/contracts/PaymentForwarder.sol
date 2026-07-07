// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title PaymentForwarder
 * @notice EIP-3009-style offline authorizations for ANY standard ERC-20.
 * @dev The payer must `approve()` this forwarder once per token (while online).
 *      The signed message includes the token address so one forwarder handles all ERC-20s.
 */
contract PaymentForwarder is EIP712, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant TRANSFER_WITH_AUTHORIZATION_TYPEHASH = keccak256(
        "TransferWithAuthorization(address token,address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
    );

    bytes32 public constant RECEIVE_WITH_AUTHORIZATION_TYPEHASH = keccak256(
        "ReceiveWithAuthorization(address token,address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
    );

    mapping(address => mapping(address => mapping(bytes32 => bool))) private _authorizationStates;

    error AuthorizationAlreadyUsed();
    error AuthorizationNotYetValid();
    error AuthorizationExpired();
    error InvalidSignature();
    error CallerMustBePayee();
    error ZeroAddress();
    error InsufficientAllowance();
    error InsufficientBalance();

    event AuthorizationUsed(
        address indexed token, address indexed authorizer, bytes32 indexed nonce
    );

    constructor() EIP712("Moo Payment Forwarder", "1") {}

    function authorizationState(address token, address authorizer, bytes32 nonce)
        external
        view
        returns (bool)
    {
        return _authorizationStates[token][authorizer][nonce];
    }

    function transferWithAuthorization(
        address token,
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external nonReentrant {
        _transferWithAuthorization(
            token, from, to, value, validAfter, validBefore, nonce, v, r, s,
            TRANSFER_WITH_AUTHORIZATION_TYPEHASH
        );
    }

    function receiveWithAuthorization(
        address token,
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external nonReentrant {
        if (to != msg.sender) revert CallerMustBePayee();
        _transferWithAuthorization(
            token, from, to, value, validAfter, validBefore, nonce, v, r, s,
            RECEIVE_WITH_AUTHORIZATION_TYPEHASH
        );
    }

    function transferWithAuthorization(
        address token,
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        bytes memory signature
    ) external nonReentrant {
        _transferWithAuthorization(
            token, from, to, value, validAfter, validBefore, nonce, signature,
            TRANSFER_WITH_AUTHORIZATION_TYPEHASH
        );
    }

    function receiveWithAuthorization(
        address token,
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        bytes memory signature
    ) external nonReentrant {
        if (to != msg.sender) revert CallerMustBePayee();
        _transferWithAuthorization(
            token, from, to, value, validAfter, validBefore, nonce, signature,
            RECEIVE_WITH_AUTHORIZATION_TYPEHASH
        );
    }

    function _transferWithAuthorization(
        address token,
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s,
        bytes32 typeHash
    ) private {
        if (token == address(0) || from == address(0) || to == address(0)) revert ZeroAddress();
        _requireValidAuthorization(token, from, nonce, validAfter, validBefore);

        bytes32 structHash = keccak256(
            abi.encode(typeHash, token, from, to, value, validAfter, validBefore, nonce)
        );
        bytes32 digest = _hashTypedDataV4(structHash);

        address recovered = ECDSA.recover(digest, v, r, s);
        if (recovered != from) revert InvalidSignature();

        _executeTransfer(token, from, to, value, nonce);
    }

    function _transferWithAuthorization(
        address token,
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        bytes memory signature,
        bytes32 typeHash
    ) private {
        if (token == address(0) || from == address(0) || to == address(0)) revert ZeroAddress();
        _requireValidAuthorization(token, from, nonce, validAfter, validBefore);

        bytes32 structHash = keccak256(
            abi.encode(typeHash, token, from, to, value, validAfter, validBefore, nonce)
        );
        bytes32 digest = _hashTypedDataV4(structHash);

        address recovered = ECDSA.recover(digest, signature);
        if (recovered != from) revert InvalidSignature();

        _executeTransfer(token, from, to, value, nonce);
    }

    function _executeTransfer(
        address token,
        address from,
        address to,
        uint256 value,
        bytes32 nonce
    ) private {
        IERC20 erc20 = IERC20(token);

        if (erc20.allowance(from, address(this)) < value) revert InsufficientAllowance();
        if (erc20.balanceOf(from) < value) revert InsufficientBalance();

        _authorizationStates[token][from][nonce] = true;
        emit AuthorizationUsed(token, from, nonce);

        erc20.safeTransferFrom(from, to, value);
    }

    function _requireValidAuthorization(
        address token,
        address authorizer,
        bytes32 nonce,
        uint256 validAfter,
        uint256 validBefore
    ) private view {
        if (_authorizationStates[token][authorizer][nonce]) revert AuthorizationAlreadyUsed();
        if (block.timestamp < validAfter) revert AuthorizationNotYetValid();
        if (block.timestamp > validBefore) revert AuthorizationExpired();
    }
}
