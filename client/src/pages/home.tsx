import { Link } from "wouter";
import { Monitor, Gamepad2, Wifi, Copy, Check } from "lucide-react";
import { useState, useEffect } from "react";
import xLogo from "@assets/Artboard_1-100_1769955694194.JPG";

export default function Home() {
  const [networkInfo, setNetworkInfo] = useState<{ localIP: string | null; connectionUrl: string | null } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch('/api/network-info')
      .then(res => res.json())
      .then(data => setNetworkInfo(data))
      .catch(() => setNetworkInfo(null));
  }, []);

  const copyToClipboard = () => {
    if (networkInfo?.connectionUrl) {
      navigator.clipboard.writeText(networkInfo.connectionUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-4">
      <div className="text-center space-y-8">
        <div>
          <h1 
            className="text-5xl font-bold text-[#ff2c2c] tracking-tight mb-2 flex items-center justify-center"
            style={{textShadow: '0 0 20px #ff2c2c, 0 0 40px #ff2c2c'}}
          >
            <span>MAD</span>
            <img 
              src={xLogo} 
              alt="X" 
              className="inline-block mx-2"
              style={{ height: '1.2em', width: 'auto', marginTop: '-0.05em', borderRadius: '4px' }}
            />
            <span>PERIENCE</span>
          </h1>
          <p className="text-2xl text-gray-400">TETRIS</p>
        </div>

        <p className="text-gray-500 max-w-md mx-auto">
          Choose how you want to use this device
        </p>

        <div className="flex flex-col sm:flex-row gap-6 justify-center">
          <Link href="/display">
            <div 
              className="w-64 p-8 bg-[#1a1a1a] rounded-xl border-2 border-[#ff2c2c]/30 hover:border-[#ff2c2c] transition-all cursor-pointer group"
              data-testid="link-display"
            >
              <Monitor className="w-16 h-16 mx-auto mb-4 text-[#ff2c2c] group-hover:scale-110 transition-transform" style={{filter: 'drop-shadow(0 0 10px #ff2c2c)'}} />
              <h2 className="text-2xl font-bold text-white mb-2">Display</h2>
              <p className="text-sm text-gray-500">
                Show the game on this screen (LED wall, projector, TV)
              </p>
            </div>
          </Link>

          <Link href="/controller">
            <div 
              className="w-64 p-8 bg-[#1a1a1a] rounded-xl border-2 border-[#00f5ff]/30 hover:border-[#00f5ff] transition-all cursor-pointer group"
              data-testid="link-controller"
            >
              <Gamepad2 className="w-16 h-16 mx-auto mb-4 text-[#00f5ff] group-hover:scale-110 transition-transform" style={{filter: 'drop-shadow(0 0 10px #00f5ff)'}} />
              <h2 className="text-2xl font-bold text-white mb-2">Controller</h2>
              <p className="text-sm text-gray-500">
                Use this device as a remote control (tablet, phone)
              </p>
            </div>
          </Link>
        </div>

        <p className="text-xs text-gray-600 max-w-md mx-auto">
          Open Display on one device and Controller on another to play together
        </p>

        {/* Local Network Info for Offline Play */}
        {networkInfo?.connectionUrl && (
          <div className="mt-8 p-4 bg-[#1a1a1a] rounded-xl border border-[#22c55e]/30 max-w-md mx-auto">
            <div className="flex items-center justify-center gap-2 mb-2">
              <Wifi className="w-5 h-5 text-[#22c55e]" />
              <span className="text-sm text-[#22c55e] font-semibold">Offline Multi-Device Play</span>
            </div>
            <p className="text-xs text-gray-400 mb-3">
              Connect other devices on the same WiFi network:
            </p>
            <div 
              className="flex items-center justify-center gap-2 p-2 bg-black/50 rounded-lg cursor-pointer hover:bg-black/70 transition-colors"
              onClick={copyToClipboard}
              data-testid="button-copy-url"
            >
              <code className="text-[#00f5ff] text-lg font-mono">
                {networkInfo.connectionUrl}
              </code>
              {copied ? (
                <Check className="w-5 h-5 text-[#22c55e]" />
              ) : (
                <Copy className="w-5 h-5 text-gray-400 hover:text-white" />
              )}
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Click to copy. Enter this address on your phone/tablet browser.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
