# Airlock Guard

AIRLOCK lets an operator review payment requests before sending native XLM on Stellar testnet.

## Run locally

Requirements: Node.js 24 and pnpm 11.

    pnpm install
    pnpm --filter @workspace/airlock run dev

Open http://localhost:5000.

## Stellar testnet flow

1. Install the Freighter browser extension and create or select a Stellar testnet account.
2. Connect Freighter in AIRLOCK. The app checks that Freighter is set to Stellar testnet before signing.
3. Choose Get testnet XLM to request test tokens from Stellar Friendbot. Testnet XLM pays testnet transaction fees.
4. Create a request with its USD policy amount, a Stellar G-address, and the actual payment amount in XLM.
5. Approve the request and confirm the payment in Freighter. AIRLOCK marks it approved only after Horizon accepts the transaction.

The USD amount is only used by AIRLOCK's local budget and limit rules. It is not converted to XLM. Request history is stored in this browser. This build is for testnet only and does not use mainnet funds.

## Deploy to Vercel

The repository-root vercel.json builds the AIRLOCK workspace package and serves artifacts/airlock/dist/public. Import the repository into Vercel with the repository root as the project root.
