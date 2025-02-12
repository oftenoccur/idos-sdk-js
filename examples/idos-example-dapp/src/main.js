import { ethers } from "ethers";

import { idOS } from "@idos-network/idos-sdk";
import { setupWalletSelector } from "@near-wallet-selector/core";
import { setupHereWallet } from "@near-wallet-selector/here-wallet";
import { setupMeteorWallet } from "@near-wallet-selector/meteor-wallet";
import { setupModal } from "@near-wallet-selector/modal-ui-js";
import "@near-wallet-selector/modal-ui-js/styles.css";
import { setupMyNearWallet } from "@near-wallet-selector/my-near-wallet";
import { setupNightly } from "@near-wallet-selector/nightly";

import { Cache } from "./cache";
import * as client from "./client";
import { Terminal } from "./terminal";

/*
 * Example wallet connection options
 *
 */
let chosenWallet = window.localStorage.getItem("chosen-wallet");
const chosenFlow = JSON.parse(window.localStorage.getItem("chosen-flow")) || {};

if (!chosenWallet) {
  await new Promise((resolve) => {
    const walletChooser = document.querySelector("#wallet-chooser");
    walletChooser.style.display = "block";
    walletChooser.addEventListener("submit", async (e) => {
      e.preventDefault();
      walletChooser.style.display = "none";

      chosenWallet = e.submitter.name;
      window.localStorage.setItem("chosen-wallet", chosenWallet);

      for (const flow of walletChooser.querySelectorAll("input[type=checkbox]")) {
        chosenFlow[flow.name] = flow.checked;
      }

      window.localStorage.setItem("chosen-flow", JSON.stringify(chosenFlow));
      resolve();
    });
  });
}

const contractId = import.meta.env.VITE_IDOS_NEAR_DEFAULT_CONTRACT_ID;
const network = import.meta.env.DEV ? "testnet" : "mainnet";

const connectWallet = {
  EVM: async () => {
    const provider = new ethers.BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();
    return { signer, address: signer.address };
  },

  NEAR: async () => {
    const selector = await setupWalletSelector({
      network,
      modules: [setupHereWallet(), setupMeteorWallet(), setupMyNearWallet(), setupNightly()],
    });

    !selector.isSignedIn() &&
      (await new Promise((resolve) => {
        const modal = setupModal(selector, { contractId, methodNames: [] });

        // NOTE: `setTimeout` gives Meteor's extension a chance to breathe.
        // We observe that it triggers this callback before it's ready for a
        // second method call, which `setNearSigner` does immediately after
        // this promise resolves
        modal.on("onHide", () => setTimeout(resolve, 100));
        modal.show();
      }));

    const signer = await selector.wallet();
    return { signer, address: (await signer.getAccounts())[0].accountId };
  },
};

/*
 * 🚀 idOS, here we go!
 * */
(async () => {
  /*
   * Initializing the idOS
   *
   */
  const idos = await idOS.init({
    nodeUrl: import.meta.env.VITE_IDOS_NODE_URL,
    dbId: import.meta.env.VITE_IDOS_NODE_KWIL_DB_ID,
    enclaveOptions: {
      container: "#idos-container",
      throwOnUserCancelUnlock: false,
    },
  });
  window.idos = idos;
  window.vc = idOS.verifiableCredentials;

  /*
   * Setting up the demo
   *
   */
  const terminal = new Terminal("#terminal", idos);
  const cache = new Cache();

  /*
   * Connecting a wallet
   *
   */
  const { signer, address } = await terminal
    .h1("rocket", "idOS connection")
    .h2("Node URL")
    .log(idos.nodeUrl)
    .wait("awaiting wallet", connectWallet[chosenWallet]());

  if (!address) return;

  /*
   * Are you in the idOS?
   *
   */
  const hasProfile = await terminal.wait(
    "checking if idOS profile exists",
    idos.hasProfile(address),
  );

  if (!hasProfile) {
    terminal
      .h1("pleading", `No idOS profile found for ${address}`)
      .h2("Need an idOS profile?")
      .log(`Get one at <a href="${import.meta.env.VITE_FRACTAL_ID_URL}">Fractal ID</a>`)
      .h2("Already have one?")
      .log("Please connect with the right address")
      .status("done", "Done");
    return;
  }

  /*
   * Optional consent screen
   *
   */
  if (chosenFlow.consent) {
    let consent = cache.get("consent");
    await new Promise((resolve) => setTimeout(resolve, consent ? 0 : 250));
    consent = await terminal
      .h1("ask", "Consent request")
      .log("(optional) you can use our SDK as consent UI")
      .wait(
        "awaiting consent",
        consent || idos.enclave.confirm("Do we have your consent to read data from the idOS?"),
      );
    terminal.h2("Consent").log(consent);
    cache.set("consent", consent);

    if (!consent) return terminal.status("done", "No consent: stopped");
  }

  /*
   * Setting the signer right before querying
   *
   */
  if (!Object.values(chosenFlow).includes(true)) return;

  await terminal.wait(
    "awaiting idOS authentication (signatures and password)",
    idos.setSigner(chosenWallet, signer),
  );

  /*
   * Some idOS queries
   *
   * or just use the console:
   * console.log(await idos.data.list("wallets"));
   *
   */
  if (chosenFlow.wallets) {
    const wallets = cache.get("wallets") || idos.data.list("wallets");
    terminal.h1("eyes", "User's wallets").wait("awaiting signature", wallets);
    terminal.table(await wallets, ["address", "public_key"], {
      address: (address) => {
        if (address.match(/^0x[0-9A-Fa-f]{40}$/i)) {
          window.open(`https://zapper.xyz/account/${address}`);
        } else if (address.match(/^\w+\.(near|testnet)$/i)) {
          window.open(`https://explorer.${network}.near.org/accounts/${address}`);
        }
      },
    });
    cache.set("wallets", await wallets);
  }

  // We'll need this later on to request grants.
  const granteeInfo = await terminal.wait("awaiting server data", client.getInfo(chosenWallet));

  if (chosenFlow.credentials) {
    // TODO: Why is this showing me the copies that belong to AGs? :x
    // https://github.com/idos-network/idos-schema/pull/36
    let credentials = await terminal
      .h1("eyes", "User's credentials")
      .wait("awaiting signature", cache.get("credentials") || idos.data.list("credentials"));
    credentials = credentials.filter((c) => c.original_id === null);

    cache.set("credentials", credentials);

    const { id, ...fields } = JSON.parse(credentials[0].public_notes);

    terminal.table(
      credentials.map((credential) => {
        return {
          ...credential,
          ...fields,
        };
      }),
      ["id", ...Object.keys(fields)],
      {
        id: async (id) => {
          const credential = await terminal
            .detail()
            .h1("inspect", `Credential # ${id}`)
            .wait(
              "awaiting signature",
              cache.get(`credential_${id}`) || idos.data.get("credentials", id),
            );
          cache.set(`credential_${id}`, credential);

          await terminal
            .wait("verifying credential...", idOS.verifiableCredentials.verify(credential.content))
            .then((_) => terminal.status("done", "Verified"))
            .catch(terminal.error.bind(terminal));

          terminal.h1("eyes", "Content").json(JSON.parse(credential.content));
          terminal.br();

          const buttonId = `acquire-access-grant-${id}`;
          terminal.button(buttonId, "🔏 Acquire access grant", async () => {
            terminal.removeButton(buttonId);

            let timelock =
              window.prompt(
                "Please enter the grant timelock in seconds",
                granteeInfo.lockTimeSpanSeconds,
              ) || granteeInfo.lockTimeSpanSeconds;

            timelock = Number.isInteger(+timelock) ? +timelock : granteeInfo.lockTimeSpanSeconds;

            const grantPromise = idos.grants.create(
              "credentials",
              id,
              granteeInfo.grantee,
              Math.floor(Date.now() / 1000) + timelock,
              granteeInfo.encryptionPublicKey,
            );

            try {
              const result = await terminal.wait("creating access grant...", grantPromise);
              terminal.status("done", `Created access grant with dataId ${result.grant.dataId}`);
            } catch (e) {
              terminal.error(e);
              return;
            }

            cache.set("grants", null);
            terminal.br();
            terminal.log("Press Restart to see the newly created access grant.");
            terminal.br();

            chosenFlow.grants = true;
            window.localStorage.setItem("chosen-flow", JSON.stringify(chosenFlow));
            terminal.button(`restart-${id}`, "Restart", terminal.reloadPage);
          });
        },
      },
    );
  }

  if (chosenFlow.grants) {
    /** @type {string} */
    let ownerAddress;
    switch (chosenWallet) {
      case "EVM":
        ownerAddress = address;
        break;
      case "NEAR":
        ownerAddress = idos.auth.currentUser.publicKey;
        break;
      default:
        throw new Error("Unreachable");
    }

    const page = 1;
    const size = 10;

    const grants = await terminal
      .h1("eyes", "User's grants to this dApp")
      .wait(
        "awaiting RPC",
        cache.get("grants") || (await idos.grants.getGrantsGranted(page, size)).grants,
      );

    const grantsCount = cache.get("grants-count") || (await idos.grants.getGrantsGrantedCount());
    const renderedCount = grants.length > size ? size : grants.length;

    cache.set("grants", grants);
    cache.set("grants-count", grantsCount);

    terminal.table(grants, ["ownerUserId", "dataId", "granteeAddress", "lockedUntil"], {
      dataId: async (dataId) => {
        terminal.detail().h1("inspect", `Access grant for ${dataId}`);

        let content;
        try {
          content = await terminal.wait(
            "awaiting server decryption",
            client.fetchAndDecryptSharedCredential(chosenWallet, dataId),
          );

          terminal.status("done", "Decrypted");
        } catch (e) {
          terminal.error(e);
          return;
        }

        terminal.h1("eyes", "Content").json(JSON.parse(content));
      },
    });
    terminal.h1("", `First ${renderedCount} of ${grantsCount} grants`).json(JSON.parse(content));
  }
  terminal.status("done", "Done");
})();
