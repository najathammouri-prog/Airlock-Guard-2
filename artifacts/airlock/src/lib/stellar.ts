import { Asset, BASE_FEE, Horizon, Memo, Networks, Operation, TransactionBuilder } from '@stellar/stellar-sdk';

export const STELLAR_TESTNET_PASSPHRASE = Networks.TESTNET;

export async function submitTestnetPayment({
  sourceAddress,
  destination,
  amount,
  memo,
  sign,
}: {
  sourceAddress: string;
  destination: string;
  amount: string;
  memo: string;
  sign: (transactionXdr: string) => Promise<string>;
}) {
  const server = new Horizon.Server('https://horizon-testnet.stellar.org');
  const account = await server.loadAccount(sourceAddress);
  const transaction = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(
      Operation.payment({
        destination,
        asset: Asset.native(),
        amount,
      }),
    )
    .addMemo(Memo.text(memo))
    .setTimeout(30)
    .build();

  const signedXdr = await sign(transaction.toXdr());
  const signedTransaction = TransactionBuilder.fromXdr(
    signedXdr,
    Networks.TESTNET,
  );

  return server.submitTransaction(signedTransaction);
}
