import { ClassicLevel } from "classic-level";
import { createGrpcServer } from "./create_grpc_server";
import { ABCIServiceService } from "./proto/cometbft/abci/v1/service_grpc_pb";
import * as pb from "./proto/cometbft/abci/v1/types_pb";
import { Timer } from "./timer";
import * as AllValidators from "../data/node0/config/genesis.json";

AllValidators.validators[0].address;

class Application {
  private db = new ClassicLevel("./data");
  private batch?: ReturnType<typeof this.db.batch>;

  private server = createGrpcServer({
    service: ABCIServiceService,
    name: "ABCIService",
    methods: {
      echo: async (ctx) => {
        ctx.res = new pb.EchoResponse().setMessage(ctx.req.getMessage());
      },
      flush: async (ctx) => {
        ctx.res = new pb.FlushResponse();
      },
      info: async (ctx) => {
        ctx.res = new pb.InfoResponse();
      },
      checkTx: async (ctx) => {
        const tx = Buffer.from(ctx.req.getTx()).toString("ascii");
        const valid = this.isValid(tx);
        ctx.res = new pb.CheckTxResponse().setCode(valid ? 0 : 1);
      },
      query: async (ctx) => {
        const data = Buffer.from(ctx.req.getData()).toString("ascii");
        const value = await this.db.get(data).catch((e) => undefined);
        console.log({ data, value });
        ctx.res = new pb.QueryResponse();
        if (value) {
          ctx.res.setLog("exists");
          ctx.res.setValue(Buffer.from(value));
        } else {
          ctx.res.setLog("AZT: key does not exist");
        }
      },
      commit: async (ctx) => {
        const t = new Timer();
        if (!this.batch) {
          throw new Error("AZT: No batch.");
        }
        await this.batch.write();
        this.batch = undefined;
        ctx.res = new pb.CommitResponse();
        console.log(`AZT: commit: took=${t.ms(2)}ms`);
      },
      initChain: async (ctx) => {
        ctx.req.getValidatorsList();
        ctx.res = new pb.InitChainResponse();
      },
      listSnapshots: async (ctx) => {
        ctx.res = new pb.ListSnapshotsResponse();
      },
      offerSnapshot: async (ctx) => {
        ctx.res = new pb.OfferSnapshotResponse();
      },
      loadSnapshotChunk: async (ctx) => {
        ctx.res = new pb.LoadSnapshotChunkResponse();
      },
      applySnapshotChunk: async (ctx) => {
        ctx.res = new pb.ApplySnapshotChunkResponse().setResult(
          pb.ApplySnapshotChunkResult.APPLY_SNAPSHOT_CHUNK_RESULT_ACCEPT
        );
      },
      prepareProposal: async (ctx) => {
        const t = new Timer();
        ctx.res = new pb.PrepareProposalResponse().setTxsList(
          ctx.req.getTxsList()
        );
        console.log(`AZT: prepareProposal: took=${t.ms(2)}ms`);
      },
      processProposal: async (ctx) => {
        ctx.res = new pb.ProcessProposalResponse().setStatus(
          pb.ProcessProposalStatus.PROCESS_PROPOSAL_STATUS_ACCEPT
        );
      },
      extendVote: async (ctx) => {
        ctx.res = new pb.ExtendVoteResponse();
      },
      verifyVoteExtension: async (ctx) => {
        ctx.res = new pb.VerifyVoteExtensionResponse();
      },
      finalizeBlock: async (ctx) => {
        const t = new Timer();
        if (this.batch) {
          throw new Error("AZT: Already have a batch.");
        }
        this.batch = this.db.batch();
        const reqTxs = ctx.req
          .getTxsList()
          .map((tx) => Buffer.from(tx).toString("ascii"));
        const txs = reqTxs.map((_) => new pb.ExecTxResult());
        for (let i = 0; i < txs.length; ++i) {
          const tx = reqTxs[i];
          if (!this.isValid(tx)) {
            console.log(`Invalid tx: ${tx}`);
            txs[i].setCode(1);
          }
          const [k, v] = tx.split("=");
          // console.log(`Adding key ${k} with value ${v.slice}`);
          this.batch.put(k, v);
        }

        const numValidators = AllValidators.validators.length;
        ctx.req.getHeight();
        // const v0 = AllValidators.validators[0];
        // const validatorUpdate = new pb.ValidatorUpdate()
        //   .setPower(1)
        //   .setPubKeyType(v0.pub_key.type)
        //   .setPubKeyBytes(v0.pub_key.value);
        // const validatorUpdates = [validatorUpdate];
        ctx.res = new pb.FinalizeBlockResponse().setTxResultsList(txs);
        // .setValidatorUpdatesList(validatorUpdates);
        console.log(`AZT: finalizeBlock: took=${t.ms(2)}ms`);
      },
    },
  });

  start(uri: string) {
    console.log(`Starting server on: ${uri}`);
    const options = {
      "grpc.max_receive_message_length": 16777216,
    };
    this.server.start(uri, undefined, options);
  }

  private isValid(tx: string) {
    return tx.split("=").length == 2;
  }
}

async function main() {
  const uri = process.argv[2] || "0.0.0.0:26658";
  const app = new Application();
  app.start(uri);
}

main().catch(console.error);
