import { idOSGrantee } from "@idos-network/grantee-sdk-js";
import { ethers } from "ethers";

/* global crypto */
//@ts-ignore 🔨 to make it work locally and on Vercel.
if (!global.crypto) global.crypto = (await import("node:crypto")).default;

// These should be secrets and gotten from process.env, or wherever you keep your secrets.
const ENCRYPTION_SECRET_KEY = "2bu7SyMToRAuFn01/oqU3fx9ZHo9GKugQhQYmDuBXzg=";
const EVM_GRANTEE_PRIVATE_KEY =
  "0x515c2fed89c22eaa9d41cfce6e6e454fa0a39353e711d6a99f34b4ecab4b4859";
const EVM_NODE_URL = "https://nodes.idos.network";

const evmGranteeSigner = new ethers.Wallet(
  EVM_GRANTEE_PRIVATE_KEY,
  new ethers.JsonRpcProvider(EVM_NODE_URL),
);

const idOSGranteeInstance = await idOSGrantee.init({
  granteeSigner: evmGranteeSigner,
  recipientEncryptionPrivateKey: ENCRYPTION_SECRET_KEY,
  nodeUrl: EVM_NODE_URL,
});

const encryptionPublicKey = idOSGranteeInstance.encryptionPublicKey;
const lockTimeSpanSeconds = 3600; // one hour

import type { VercelRequest, VercelResponse } from "@vercel/node";
export default async function (request: VercelRequest, response: VercelResponse) {
  const requestMethod = request.method as string;

  if (requestMethod === "GET") {
    return response.json({
      encryptionPublicKey,
      lockTimeSpanSeconds,
      grantee: idOSGranteeInstance.address,
    });
  }

  if (requestMethod !== "POST") {
    return response.status(405).send("Only GETs and POSTs are supported.");
  }

  const rawBody = request.read();
  let body;
  try {
    body = JSON.parse(rawBody);
  } catch (e) {
    return response.status(400).send(`Invalid body: ${new String(e)}`);
  }
  if (!body.dataId) {
    return response.status(400).send("POSTs must send a JSON object with a 'dataId' field.");
  }

  const { dataId } = body as { dataId: string };
  try {
    return response.json(await idOSGranteeInstance.getSharedCredentialContentDecrypted(dataId));
  } catch (e) {
    console.error(e);
    return response.status(500).send(e.toString());
  }
}
