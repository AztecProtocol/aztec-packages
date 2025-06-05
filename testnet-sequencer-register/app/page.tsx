"use client"

import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Shield, ArrowRight, X } from "lucide-react"
import RotatingGlobe from "@/components/rotating-globe"
import { ZKPassport, ProofResult } from "@zkpassport/sdk";
import QRCode from "react-qr-code";
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount } from "wagmi"


export default function Home() {
  const [proofStatus, setProofStatus] = useState<"idle" | "generating" | "ready">("idle")
  const [sendStatus, setSendStatus] = useState<"idle" | "sending" | "sent">("idle")
  const zkPassportRef = useRef<ZKPassport | null>(null);
  const [queryUrl, setQueryUrl] = useState("");
  const [requestInProgress, setRequestInProgress] = useState(false);
  const [uniqueIdentifier, setUniqueIdentifier] = useState("");

  const { address } = useAccount();

  // TODO: set as status's?
  const [message, setMessage] = useState("");
  const [proofs, setProofs] = useState<ProofResult[]>([]);
  const [showQRModal, setShowQRModal] = useState(false);

  const handleGenerateProof = () => {
    setProofStatus("generating")
    createRequest();
  }

  const handleSendProof = () => {
    if (proofStatus !== "ready") return

    setSendStatus("sending")
    // Simulate sending proof
    setTimeout(() => {
      setSendStatus("sent")
      // Reset after a while
      setTimeout(() => {
        setProofStatus("idle")
        setSendStatus("idle")
      }, 3000)
    }, 1500)
  }

  const createRequest = async () => {
    if (!zkPassportRef.current) {
      return;
    }
    const queryBuilder = await zkPassportRef.current.request({
      name: "ZKPassport",
      logo: "https://zkpassport.id/favicon.png",
      purpose: "Sybil resistance for the Alpha testnet sequencer (no personal information required)",
      scope: "alpha-testnet-sequencer",
      mode: "compressed-evm",
      devMode: true,
    });
    setQueryUrl("");

    const {
      url,
      onRequestReceived,
      onGeneratingProof,
      onProofGenerated,
      onResult,
      onReject,
      onError,
    } = queryBuilder
      .done();

    setQueryUrl(url);
    setRequestInProgress(true);
    setShowQRModal(true);

      onRequestReceived(() => {
        console.log("QR code scanned");
        setMessage("Request received");
      });

    const proofs: ProofResult[] = [];

    onProofGenerated((result: ProofResult) => {
      console.log("Proof result", result);
      proofs.push(result);
      setProofs(proofs);
      setMessage(`Proofs received`);
      setRequestInProgress(false);
      setShowQRModal(false);
      setProofStatus("ready");
    });

    onGeneratingProof(() => {
      console.log("Generating proof");
      setMessage("Generating proof...");
      setProofStatus("generating");
    });

    onResult(async ({ uniqueIdentifier }) => {
      setMessage("Result received");
      setUniqueIdentifier(uniqueIdentifier || "");
      console.log("Unique identifier", uniqueIdentifier);
      setRequestInProgress(false);
    });

    onReject(() => {
      console.log("User rejected");
      setMessage("User rejected the request");
      setRequestInProgress(false);
      setShowQRModal(false);
      setProofStatus("idle");
    });

    onError((error: unknown) => {
      console.error("Error", error);
      setMessage("An error occurred");
      setRequestInProgress(false);
      setShowQRModal(false);
      setProofStatus("idle");
    });
  }

  const depositSequencer = async () => {
    if (!zkPassportRef.current) {
      return;
    }

    // const params = zkPassportRef.current.getSolidityVerifierParameters({
    //   proof,
    //   scope: "alpha-testnet-sequencer",
    //   devMode: true,
    // });

    // const { address, abi, functionName } =
    //   zkPassportRef.current.getSolidityVerifierDetails("ethereum_sepolia");



  }

  useEffect(() => {
    if (!zkPassportRef.current) {
      zkPassportRef.current = new ZKPassport(window.location.hostname);
    }
  }, []);

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-[#f3e6ff] via-[#e0b3ff] to-[#c1b6fc]">
      {/* Aztec Banner */}
      <div className="fixed top-4 left-0 w-full z-40 flex justify-center pointer-events-none">
        <div className="bg-[#7c5cff] rounded-2xl px-6 py-3 flex items-center justify-between shadow-lg w-full max-w-5xl mx-4 pointer-events-auto">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-2">
              <span className="w-8 h-8 block">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 82.3 82.3" className="w-8 h-8">
                  <g>
                    <path fill="#2f1f49" fillRule="evenodd" d="m49.55,3.46l29.29,29.29c4.62,4.62,4.62,12.11,0,16.73l-29.35,29.36c-4.62,4.62-12.11,4.62-16.73,0L3.46,49.55c-4.62-4.62-4.62-12.11,0-16.73L32.82,3.46c4.62-4.62,12.11-4.62,16.73,0Zm-10.35,7.43l-.12.11-28.07,28.07c-1.12,1.12-1.15,2.9-.11,4.07l.11.12,28.03,28.03c1.12,1.12,2.9,1.15,4.06.11l.12-.11,28.07-28.07c1.15-1.15,1.15-3.02,0-4.18l-28.03-28.03c-1.12-1.12-2.9-1.15-4.06-.11Zm2.49,12.35l17.36,17.37c.29.29.29.75,0,1.05l-17.39,17.39c-.29.29-.76.29-1.05,0l-17.36-17.37c-.29-.29-.29-.75,0-1.05l17.39-17.39c.29-.29.76-.29,1.05,0Z"/>
                  </g>
                </svg>
              </span>
              <span className="text-white font-bold text-xl">Aztec</span>
            </span>
          </div>
          <div className="flex gap-6 items-center">
            <a href="https://aztec.nethermind.io" target="_blank" rel="noopener noreferrer" className="text-white/80 hover:text-white transition">Node Explorer</a>
            <ConnectButton />
          </div>
        </div>
      </div>
      <div className="h-24" /> {/* Spacer for the fixed banner */}

      {/* Background Globe */}
      <div className="fixed inset-0 z-0">
        <RotatingGlobe />
      </div>

      {/* QR Code Modal */}
      {showQRModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80" onClick={() => {
          setShowQRModal(false);
          setProofStatus("idle");
          setSendStatus("idle");
          setMessage("");
        }}>
          <div className="relative rounded-lg bg-gradient-to-br from-[#f3e6ff] via-[#e0b3ff] to-[#c1b6fc] p-8 shadow-xl" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => {
                setShowQRModal(false);
                setProofStatus("idle");
                setSendStatus("idle");
                setMessage("");
              }}
              className="absolute right-4 top-4 text-gray-600 hover:text-gray-900"
            >
              <X className="h-6 w-6" />
            </button>
            <div className="mb-6 text-center">
              <h3 className="mb-2 text-xl font-semibold text-gray-900">Scan QR Code</h3>
              <p className="text-gray-700">Scan this QR code with your ZKPassport app to generate your proof</p>
            </div>
            <div className="mb-6 flex justify-center">
              <div className="rounded-lg bg-white p-4">
                <QRCode value={queryUrl} size={200} />
              </div>
            </div>
            <div className="text-center text-sm text-gray-700">
              {message || "Waiting for scan..."}
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="relative z-20 flex min-h-screen flex-col items-center justify-center px-4 text-black">
        <div className="mb-8 flex items-center gap-2">
          <Shield className="h-10 w-10 text-purple-500" />
          <h1 className="text-3xl font-bold text-black">Aztec Sequencer Access</h1>
        </div>

        <div className="mb-12 max-w-xl text-center">
          <p className="text-lg text-gray-800">
            Generate and submit your passport proof to gain access to the Aztec Networks sequencer set.
          </p>
        </div>

        <div className="flex w-full max-w-md flex-col gap-6">
          <div className="rounded-lg border border-zinc-800 bg-white/80 p-6 backdrop-blur-md">
            <h2 className="mb-4 text-xl font-semibold text-black">Passport Verification</h2>

            {!address ? (
              <div className="mb-6 rounded-lg border border-yellow-500/20 bg-yellow-500/10 p-4 text-center">
                <p className="mb-4 text-yellow-700">Please connect your wallet to continue</p>
                <div className="flex justify-center">
                  <ConnectButton />
                </div>
              </div>
            ) : (
              <div className="mb-6 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-gray-700">Status:</span>
                  <span className={`font-medium ${getStatusColor(proofStatus, sendStatus)}`}>
                    {getStatusText(proofStatus, sendStatus)}
                  </span>
                </div>
              </div>
            )}

            <div className="flex flex-col gap-3 sm:flex-row">
              <Button
                onClick={handleGenerateProof}
                disabled={
                  !address ||
                  proofStatus === "generating" ||
                  proofStatus === "ready" ||
                  sendStatus === "sending" ||
                  sendStatus === "sent"
                }
                className="flex-1 bg-purple-600 hover:bg-purple-700 disabled:opacity-50"
              >
                {proofStatus === "generating" ? "Generating..." : "Generate Proof"}
              </Button>

              <Button
                onClick={handleSendProof}
                disabled={
                  !address ||
                  proofStatus !== "ready" ||
                  sendStatus === "sending" ||
                  sendStatus === "sent"
                }
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50"
              >
                {sendStatus === "sending" ? "Sending..." : sendStatus === "sent" ? "Sent!" : "Send Proof"}
                {sendStatus === "idle" && <ArrowRight className="ml-2 h-4 w-4" />}
              </Button>
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 bg-gradient-to-br from-[#f3e6ff] via-[#e0b3ff]/60 to-[#fff] p-6 shadow-md">
            <h3 className="mb-2 text-lg font-medium text-black">Sequencer Information</h3>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-700">Network:</span>
                <span>Aztec</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-700">Version:</span>
                <span>alpha-testnet</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-700">Status:</span>
                <span className="flex items-center">
                  <span className="mr-2 inline-block h-2 w-2 rounded-full bg-green-500"></span>
                  Online
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function getStatusText(proofStatus: string, sendStatus: string): string {
  if (sendStatus === "sent") return "Proof Submitted Successfully"
  if (sendStatus === "sending") return "Submitting Proof..."
  if (proofStatus === "ready") return "Proof Ready to Submit"
  if (proofStatus === "generating") return "Generating Proof..."
  return "No Proof Generated"
}

function getStatusColor(proofStatus: string, sendStatus: string): string {
  if (sendStatus === "sent") return "text-green-400"
  if (sendStatus === "sending") return "text-yellow-400"
  if (proofStatus === "ready") return "text-purple-400"
  if (proofStatus === "generating") return "text-yellow-400"
  return "text-gray-400"
}
