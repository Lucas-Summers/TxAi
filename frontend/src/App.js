import React, { useState, useEffect, useRef } from 'react';
import { Routes, Route, Link, useLocation } from 'react-router-dom';
import { RefreshCw, TrendingUp, Eye, EyeOff, BarChart3, Table, Settings, LogOut, Copy, ChevronRight, Send } from 'lucide-react';

// MetaMask donut chart palette
const donutPalette = [
  { regular: '#FF5C16', hover: '#FFA680' }, // Orange
  { regular: '#BAF24A', hover: '#E5FFC3' }, // Green
  { regular: '#89B0FF', hover: '#CCE7FF' }, // Blue
  { regular: '#D075FF', hover: '#EAC2FF' }, // Purple
  { regular: '#661800', hover: '#FFA680' }, // Dark Orange
  { regular: '#013330', hover: '#E5FFC3' }, // Dark Green
  { regular: '#190066', hover: '#CCE7FF' }, // Dark Blue
  { regular: '#3D065F', hover: '#EAC2FF' }, // Dark Purple
];

const PortfolioDonutChart = ({ portfolio, showValues = true, containerClassName = "" }) => {
  const [hoveredToken, setHoveredToken] = useState(null);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [selectedToken, setSelectedToken] = useState(null);
  const [selectedPosition, setSelectedPosition] = useState({ x: 0, y: 0 });
  const tooltipRef = useRef(null);

  const chartData = React.useMemo(() => {
    if (!portfolio || !portfolio.tokens) return [];

    // Filter tokens with USD value and sort by value (largest first)
    const tokensWithValue = portfolio.tokens
      .filter(token => token.usd_value && parseFloat(token.usd_value) > 0)
      .sort((a, b) => parseFloat(b.usd_value) - parseFloat(a.usd_value));

    const totalValue = parseFloat(portfolio.total_usd_value || 0);

    let currentAngle = -90; // Start from top (-90 degrees)

    return tokensWithValue.map((token, index) => {
      const value = parseFloat(token.usd_value);
      const percentage = (value / totalValue) * 100;
      const angle = (percentage / 100) * 360;
      const startAngle = currentAngle;
      const endAngle = currentAngle + angle;
      currentAngle = endAngle;

      // Use the donutPalette, cycling if needed
      const paletteEntry = donutPalette[index % donutPalette.length];
      const color = paletteEntry.regular;
      const hoverColor = paletteEntry.hover;

      return {
        token,
        value,
        percentage,
        startAngle,
        endAngle,
        color,
        hoverColor,
      };
    });
  }, [portfolio]);

  const formatUSD = (value) => {
    if (!value) return '$0.00';
    const num = parseFloat(value);
    return `$${num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatBalance = (balance) => {
    const num = parseFloat(balance);
    if (num === 0) return '0';
    if (num < 0.0001) return num.toExponential(2);
    if (num < 1) return num.toFixed(6);
    if (num < 1000) return num.toFixed(4);
    return num.toLocaleString(undefined, { maximumFractionDigits: 2 });
  };

  // Convert polar coordinates to cartesian
  const polarToCartesian = (centerX, centerY, radius, angleInDegrees) => {
    const angleInRadians = (angleInDegrees - 90) * Math.PI / 180.0;
    return {
      x: centerX + (radius * Math.cos(angleInRadians)),
      y: centerY + (radius * Math.sin(angleInRadians))
    };
  };

  // Create SVG path for donut slice
  const createArcPath = (centerX, centerY, startAngle, endAngle, outerRadius, innerRadius) => {
    // Handle full circle (100%) case
    if (Math.abs(endAngle - startAngle) >= 359.99) {
      // Draw two arcs to make a full donut
      const outerStart = polarToCartesian(centerX, centerY, outerRadius, startAngle);
      const outerMid = polarToCartesian(centerX, centerY, outerRadius, startAngle + 180);
      const innerStart = polarToCartesian(centerX, centerY, innerRadius, startAngle);
      const innerMid = polarToCartesian(centerX, centerY, innerRadius, startAngle + 180);

      return [
        // Outer arc (first half)
        "M", outerStart.x, outerStart.y,
        "A", outerRadius, outerRadius, 0, 1, 1, outerMid.x, outerMid.y,
        // Outer arc (second half)
        "A", outerRadius, outerRadius, 0, 1, 1, outerStart.x, outerStart.y,
        // Inner arc (first half)
        "L", innerStart.x, innerStart.y,
        "A", innerRadius, innerRadius, 0, 1, 0, innerMid.x, innerMid.y,
        // Inner arc (second half)
        "A", innerRadius, innerRadius, 0, 1, 0, innerStart.x, innerStart.y,
        "Z"
      ].join(" ");
    }

    const start = polarToCartesian(centerX, centerY, outerRadius, endAngle);
    const end = polarToCartesian(centerX, centerY, outerRadius, startAngle);
    const innerStart = polarToCartesian(centerX, centerY, innerRadius, endAngle);
    const innerEnd = polarToCartesian(centerX, centerY, innerRadius, startAngle);

    const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";

    return [
      "M", start.x, start.y,
      "A", outerRadius, outerRadius, 0, largeArcFlag, 0, end.x, end.y,
      "L", innerEnd.x, innerEnd.y,
      "A", innerRadius, innerRadius, 0, largeArcFlag, 1, innerStart.x, innerStart.y,
      "Z"
    ].join(" ");
  };

  const handleMouseMove = (e) => {
    setMousePosition({ x: e.clientX, y: e.clientY });
  };

  // Handle click outside to close tooltip
  useEffect(() => {
    if (selectedToken === null) return;
    const handleClick = (e) => {
      // If click is on a donut slice or inside the tooltip, do nothing
      if (e.target.closest('.donut-slice')) return;
      if (tooltipRef.current && tooltipRef.current.contains(e.target)) return;
      setSelectedToken(null);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [selectedToken]);

  // Handle close tooltip if hovering over a different slice
  useEffect(() => {
    if (selectedToken !== null && hoveredToken !== null && hoveredToken !== selectedToken) {
      setSelectedToken(null);
    }
  }, [hoveredToken, selectedToken]);

  const size = 600; // Increased from 400
  const center = size / 2;
  const outerRadius = 270; // Increased from 180
  const innerRadius = 160; // Increased from 100

  if (!portfolio || chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-96 bg-white/5 rounded-2xl border border-white/10">
        <p className="text-gray-400">No portfolio data to display</p>
      </div>
    );
  }

  return (
    <div className={containerClassName ? containerClassName : "relative flex flex-col items-center justify-center w-full p-0 m-0 bg-transparent border-none shadow-none"}>
      <div className="flex flex-col lg:flex-row items-center gap-8 w-full justify-center">
        {/* SVG Donut Chart */}
        <div className="relative flex items-center justify-center">
          <svg
            width={size}
            height={size}
            className="drop-shadow-lg portfolio-donut-chart-svg"
            onMouseMove={handleMouseMove}
          >
            {/* Chart slices */}
            {chartData.map((item, index) => (
              <path
                key={`${item.token.chain_id}-${item.token.address}`}
                d={createArcPath(center, center, item.startAngle, item.endAngle, outerRadius, innerRadius)}
                fill={
                  selectedToken === index
                    ? item.hoverColor
                    : hoveredToken === index
                      ? item.hoverColor
                      : item.color
                }
                stroke="rgba(255, 255, 255, 0.1)"
                strokeWidth="2"
                className="donut-slice transition-all duration-200 cursor-pointer hover:filter hover:brightness-110"
                onMouseEnter={() => setHoveredToken(index)}
                onMouseLeave={() => setHoveredToken(null)}
                onClick={e => {
                  setSelectedToken(index);
                  setSelectedPosition({ x: e.clientX, y: e.clientY });
                }}
              />
            ))}
          </svg>
          {/* Center content */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <div className="text-center">
              <p className="text-blue-200 text-lg">Total Value</p>
              <p className="text-4xl font-bold text-white">
                {showValues ? formatUSD(portfolio.total_usd_value) : '•••••'}
              </p>
              <p className="text-blue-300 text-lg mt-1">
                {portfolio.total_tokens} tokens
              </p>
            </div>
          </div>
        </div>
      </div>
      {/* Floating Tooltip */}
      {(hoveredToken !== null || selectedToken !== null) && (
        <div
          ref={tooltipRef}
          className={`fixed z-50 bg-black/90 text-white p-4 rounded-xl shadow-2xl border border-white/20 backdrop-blur-sm text-lg min-w-[220px] ${selectedToken === null ? 'pointer-events-none' : ''}`.replace('pointer-events-none', '')}
          style={{
            left: (selectedToken !== null ? selectedPosition.x : mousePosition.x) + 1,
            top: (selectedToken !== null ? selectedPosition.y : mousePosition.y) - 125,
            transform: 'translateY(-50%)'
          }}
        >
          {/* Top right button */}
          <button
            className="absolute top-2 right-2 p-2 rounded-full hover:bg-white/10 transition text-blue-300"
            style={{ lineHeight: 0 }}
            title="Send"
            onClick={() => {}}
          >
            <Send className="w-5 h-5" />
          </button>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              {chartData[selectedToken !== null ? selectedToken : hoveredToken].token.logo_uri ? (
                <img
                  src={chartData[selectedToken !== null ? selectedToken : hoveredToken].token.logo_uri}
                  alt={chartData[selectedToken !== null ? selectedToken : hoveredToken].token.symbol + ' logo'}
                  className="w-6 h-6 rounded-full bg-white/10 object-contain border border-white/20"
                  style={{ minWidth: 24, minHeight: 24 }}
                />
              ) : (
                <div
                  className="w-4 h-4 rounded-full"
                  style={{ backgroundColor: chartData[selectedToken !== null ? selectedToken : hoveredToken].color }}
                />
              )}
              <span className="font-bold">{chartData[selectedToken !== null ? selectedToken : hoveredToken].token.symbol}</span>
            </div>
            <p className="text-base text-gray-300">{chartData[selectedToken !== null ? selectedToken : hoveredToken].token.name}</p>
            <p className="text-base text-blue-300">{chartData[selectedToken !== null ? selectedToken : hoveredToken].token.chain_name}</p>
            <div className="border-t border-white/20 pt-2 mt-2">
              <p className="text-base">
                Balance: <span className="font-mono">{formatBalance(chartData[selectedToken !== null ? selectedToken : hoveredToken].token.balance)}</span>
              </p>
              <p className="text-base">
                Value: {showValues ? formatUSD(chartData[selectedToken !== null ? selectedToken : hoveredToken].value) : '•••••'}
              </p>
              <p className="text-base">
                Share: <span className="font-bold text-green-400">{chartData[selectedToken !== null ? selectedToken : hoveredToken].percentage.toFixed(2)}%</span>
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const PortfolioPage = ({ portfolio, loading, fetchPortfolio, error }) => {
  const [viewMode, setViewMode] = useState('chart');
  const [showValues, setShowValues] = useState(true);
  // Utility for formatting table values
  const formatTableValue = (value) => {
    if (!value || isNaN(value)) return '-';
    return parseFloat(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };
  const formatTableBalance = (balance) => {
    if (!balance || isNaN(balance)) return '-';
    return parseFloat(balance).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 6 });
  };
  return (
    <div className="container mx-auto px-4 pt-28 pb-8">
      <div className="p-8 w-full">
        <div className="flex items-center gap-4 mb-6 justify-center w-full">
            {/* View Mode Toggle */}
            <div className="flex bg-white/5 rounded-lg">
              <button
                onClick={() => setViewMode('chart')}
                className={`p-2 rounded-lg transition ${
                  viewMode === 'chart' 
                    ? 'bg-blue-500/30 text-blue-400' 
                    : 'text-gray-400 hover:text-white hover:bg-white/10'
                }`}
              >
                <BarChart3 className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('table')}
                className={`p-2 rounded-lg transition ${
                  viewMode === 'table' 
                    ? 'bg-blue-500/30 text-blue-400' 
                    : 'text-gray-400 hover:text-white hover:bg-white/10'
                }`}
              >
                <Table className="w-4 h-4" />
              </button>
            </div>
            {/* Privacy Toggle */}
            <button
              onClick={() => setShowValues(!showValues)}
              className="p-2 hover:bg-white/10 rounded-lg transition"
            >
              {showValues ? 
                <Eye className="w-4 h-4 text-blue-400" /> : 
                <EyeOff className="w-4 h-4 text-blue-400" />
              }
            </button>
            {/* Reload Button */}
            <button
              onClick={fetchPortfolio}
              disabled={loading}
              className="p-2 bg-blue-500/20 hover:bg-blue-500/30 rounded-lg transition"
              title="Refresh Portfolio"
            >
              <RefreshCw className={`w-4 h-4 text-blue-400 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        <div className="w-full flex flex-col items-center min-h-[300px]">
          {portfolio ? (
            <>
              {/* Chart View Animation */}
              <div
                className={
                  "w-full transition-all duration-500 origin-top " +
                  (viewMode === 'chart'
                    ? "opacity-100 scale-100 relative pointer-events-auto"
                    : "opacity-0 scale-95 absolute pointer-events-none")
                }
              >
                <PortfolioDonutChart portfolio={portfolio} showValues={showValues} containerClassName="!bg-transparent !border-none !shadow-none p-0" />
              </div>
              {/* Table View Animation */}
              <div
                className={
                  "w-full transition-all duration-500 origin-top " +
                  (viewMode === 'table'
                    ? "opacity-100 scale-100 relative pointer-events-auto"
                    : "opacity-0 scale-95 absolute pointer-events-none")
                }
              >
                <div className="flex justify-center w-full">
                  <table className="w-full max-w-3xl mx-auto">
                    <thead>
                      <tr className="border-b border-white/10">
                        <th className="text-left p-4 text-blue-200 font-semibold">Symbol</th>
                        <th className="text-left p-4 text-blue-200 font-semibold">Name</th>
                        <th className="text-left p-4 text-blue-200 font-semibold">Balance</th>
                        <th className="text-left p-4 text-blue-200 font-semibold">Price</th>
                        <th className="text-left p-4 text-blue-200 font-semibold">Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {portfolio.tokens.map((token, index) => (
                        <tr
                          key={`${token.chain_id}-${token.address}`}
                          className="border-b border-white/5 hover:bg-white/10 transition cursor-pointer"
                          onClick={() => {}}
                        >
                          <td className="p-4">
                            <div className="flex items-center gap-2">
                              {token.logo_uri && (
                                <img src={token.logo_uri} alt={token.symbol} className="w-6 h-6 rounded-full bg-white/10 border border-white/20 object-contain" />
                              )}
                              <span className="text-white font-semibold">{token.symbol}</span>
                            </div>
                          </td>
                          <td className="p-4">
                            <span className="text-gray-400 text-sm">{token.name}</span>
                          </td>
                          <td className="p-4 text-left font-mono text-white">
                            {formatTableBalance(token.balance)}
                          </td>
                          <td className="p-4 text-left text-gray-300">
                            {showValues ? (
                              <span style={{ display: 'inline-block', width: '60px' }}>${formatTableValue(token.usd_price)}</span>
                            ) : (
                              <span style={{ display: 'inline-block', width: '60px' }}>•••••</span>
                            )}
                          </td>
                          <td className="p-4 text-left font-semibold">
                            <span className={parseFloat(token.usd_value || '0') > 1 ? 'text-green-400' : 'text-gray-300'}>
                              {showValues ? (
                                <span style={{ display: 'inline-block', width: '60px' }}>${formatTableValue(token.usd_value)}</span>
                              ) : (
                                <span style={{ display: 'inline-block', width: '60px' }}>•••••</span>
                              )}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : (
            loading ? null : (
              <div className="flex flex-col items-center justify-center h-96 text-gray-400 text-xl">No data, please connect your wallet...</div>
            )
          )}
        </div>
      </div>
    </div>
  );
};

const BlankPage = ({ title }) => (
  <div className="flex flex-col items-center justify-center min-h-[60vh] text-2xl text-gray-500">
    {title}
  </div>
);

const App = () => {
  const [walletAddress, setWalletAddress] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [portfolio, setPortfolio] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showValues, setShowValues] = useState(true);
  const [viewMode, setViewMode] = useState('chart'); // 'chart' or 'table'
  const [walletMenuOpen, setWalletMenuOpen] = useState(false);
  const walletMenuRef = useRef(null);
  const [currentPage, setCurrentPage] = useState('Portfolio');
  const [ethBalance, setEthBalance] = useState('');
  const [chainName, setChainName] = useState('');
  const [copySuccess, setCopySuccess] = useState(false);
  const [navbarHovered, setNavbarHovered] = useState(false);
  const [navButtonHovered, setNavButtonHovered] = useState(false);

  // Check if MetaMask is installed
  const isMetaMaskInstalled = () => {
    return typeof window !== 'undefined' && window.ethereum;
  };

  // Connect to MetaMask
  const connectWallet = async () => {
    if (!isMetaMaskInstalled()) {
      setError('MetaMask is not installed. Please install it to continue.');
      return;
    }

    try {
      setError('');
      const accounts = await window.ethereum.request({
        method: 'eth_requestAccounts',
      });
      
      if (accounts.length > 0) {
        setWalletAddress(accounts[0]);
        setIsConnected(true);
        fetchPortfolio(accounts[0]);
      }
    } catch (err) {
      setError('Failed to connect wallet: ' + err.message);
    }
  };

  // Fetch portfolio from API
  const fetchPortfolio = async (address = walletAddress) => {
    if (!address) return;

    setLoading(true);
    setError('');

    try {
      const response = await fetch('http://localhost:8000/portfolio', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          wallet_address: address,
          min_balance: 0.000001
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      setPortfolio(data);
    } catch (err) {
      setError('Failed to fetch portfolio: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Disconnect wallet
  const disconnectWallet = () => {
    setWalletAddress('');
    setIsConnected(false);
    setPortfolio(null);
    setError('');
  };

  // Format balance for display
  const formatBalance = (balance) => {
    const num = parseFloat(balance);
    if (num === 0) return '0';
    if (num < 0.0001) return num.toExponential(2);
    if (num < 1) return num.toFixed(6);
    if (num < 1000) return num.toFixed(4);
    return num.toLocaleString(undefined, { maximumFractionDigits: 2 });
  };

  // Format USD value
  const formatUSD = (value) => {
    if (!value || value === '0') return '-';
    const num = parseFloat(value);
    return `$${num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  // Shortened address display
  const shortenAddress = (address) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  // Fetch ETH balance, chain, and portfolio on wallet connect
  useEffect(() => {
    const fetchAll = async () => {
      if (!isConnected || !walletAddress || !window.ethereum) return;
      // ETH balance
      try {
        const bal = await window.ethereum.request({
          method: 'eth_getBalance',
          params: [walletAddress, 'latest'],
        });
        setEthBalance((parseInt(bal, 16) / 1e18).toFixed(4));
      } catch (e) {
        setEthBalance('');
      }
      // Chain name
      try {
        const chainId = await window.ethereum.request({ method: 'eth_chainId' });
        const chainMap = {
          '0x1': 'Ethereum Mainnet',
          '0xa': 'OP Mainnet',
          '0x38': 'Binance Smart Chain',
          '0x89': 'Polygon Mainnet',
          '0x324': 'zkSync Era Mainnet',
          '0x42161': 'Arbitrum One',
          '0x43114': 'Avalanche Network C-Chain',
          '0x8453': 'Base Mainnet',
        };
        setChainName(chainMap[chainId] || chainId);
      } catch (e) {
        setChainName('');
      }
      // Portfolio
      fetchPortfolio(walletAddress);
    };
    fetchAll();
  }, [walletAddress, isConnected]);

  // Copy address to clipboard
  const handleCopy = () => {
    if (!walletAddress) return;
    navigator.clipboard.writeText(walletAddress);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 1200);
  };

  useEffect(() => {
    // Check if already connected
    if (isMetaMaskInstalled()) {
      window.ethereum.request({ method: 'eth_accounts' })
        .then(accounts => {
          if (accounts.length > 0) {
            setWalletAddress(accounts[0]);
            setIsConnected(true);
          }
        });
    }
  }, []);

  const location = useLocation();

  return (
    <div className="min-h-screen" style={{ background: '#131313' }}>
        {/* Top Nav Bar */}
        <nav
          className="fixed top-0 left-0 w-full z-50"
          style={{ background: '#131313'}}
          onMouseLeave={() => { setNavbarHovered(false); setNavButtonHovered(false); }}
        >
          <div className="max-w-7xl mx-auto flex items-center justify-between px-6 py-3">
            {/* Left: Nav Logo and Nav Links */}
            <div className="flex items-center gap-2 relative">
              <div
                className="relative mr-2"
                onMouseEnter={() => { setNavbarHovered(true); setNavButtonHovered(false); }}
                onMouseLeave={() => {}}
              >
                <div className="flex items-center">
                  <Link to="/" className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-xl shadow-md">
                    <span>Tx</span>
                  </Link>
                </div>
                {/* Dropdown: show if navbarHovered and not navButtonHovered */}
                <div
                  className={
                    "fixed left-2 z-50 flex flex-col min-w-[9rem] bg-[#131313] border border-gray-700 rounded-xl shadow-2xl p-2 mt-2 mb-2 origin-top transition-all duration-200" +
                    (navbarHovered && !navButtonHovered
                      ? " opacity-100 scale-y-100 pointer-events-auto"
                      : " opacity-0 scale-y-95 pointer-events-none")
                  }
                  style={{ boxShadow: '0 2px 16px 0 #0006' }}
                >
                  <button className="w-full text-left font-semibold px-4 py-2 rounded-lg transition text-gray-400 hover:text-white">About</button>
                  <button className="w-full text-left font-semibold px-4 py-2 rounded-lg transition text-gray-400 hover:text-white">Docs</button>
                  <button className="w-full text-left font-semibold px-4 py-2 rounded-lg transition text-gray-400 hover:text-white">Code</button>
                  <button className="w-full text-left font-semibold px-4 py-2 rounded-lg transition text-gray-400 hover:text-white">Help</button>
                  <button className="w-full text-left font-semibold px-4 py-2 rounded-lg transition text-gray-400 hover:text-white">Contact</button>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  to="/portfolio"
                  className={`font-semibold px-4 py-2 rounded-lg transition ${location.pathname === '/portfolio' ? 'text-white' : 'text-gray-400 hover:text-white'}`}
                  onMouseEnter={() => { setNavButtonHovered(true); setNavbarHovered(false); }}
                  onMouseLeave={() => setNavButtonHovered(false)}
                >Portfolio</Link>
                <Link
                  to="/strategies"
                  className={`font-semibold px-4 py-2 rounded-lg transition ${location.pathname === '/strategies' ? 'text-white' : 'text-gray-400 hover:text-white'}`}
                  onMouseEnter={() => { setNavButtonHovered(true); setNavbarHovered(false); }}
                  onMouseLeave={() => setNavButtonHovered(false)}
                >Strategies</Link>
                <Link
                  to="/chat"
                  className={`font-semibold px-4 py-2 rounded-lg transition ${location.pathname === '/chat' ? 'text-white' : 'text-gray-400 hover:text-white'}`}
                  onMouseEnter={() => { setNavButtonHovered(true); setNavbarHovered(false); }}
                  onMouseLeave={() => setNavButtonHovered(false)}
                >Chat</Link>
              </div>
            </div>
            {/* Right: Wallet Connection */}
            <div className="flex items-center gap-2 relative">
              <div className="relative">
                 {isConnected ? (
                   <button
                     className="p-0 bg-transparent border-none outline-none transition shadow-none"
                     style={{ borderRadius: '9999px' }}
                     onClick={() => setWalletMenuOpen((v) => !v)}
                     title="Wallet Details"
                   >
                     <MetaMaskLogo />
                   </button>
                 ) : (
                   <button
                     className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition"
                     onClick={connectWallet}
                   >
                     Connect
                   </button>
                 )}
                <div>
                  <div
                    className={`fixed top-0 right-0 z-50 flex flex-col transition-transform duration-300 ease-in-out ${walletMenuOpen && isConnected ? 'translate-x-0' : 'translate-x-full'}`}
                    style={{ height: 'calc(100vh - 2.0rem)', position: 'fixed', minWidth: '20rem', maxWidth: '24rem', width: '100%', margin: walletMenuOpen && isConnected ? '0.5rem 0.5rem 0.5rem 0' : '0', boxSizing: 'border-box' }}
                  >
                     <div
                       ref={walletMenuRef}
                       className="h-full bg-[#131313] shadow-2xl pl-5 pr-5 pt-3 pb-3 flex flex-col w-full border border-gray-700"
                       style={{ borderRadius: '0.75rem', position: 'relative' }}
                     >
                       {/* Top right: MetaMask logo and action buttons */}
                       <div className="flex items-center justify-between mb-3">
                         <MetaMaskLogo />
                         <div className="flex items-center gap-2">
                           <button className="p-2 text-gray-400 hover:text-blue-400" title="Settings"><Settings className="w-5 h-5" /></button>
                           <button className="p-2 text-gray-400 hover:text-blue-400" title="Refresh" onClick={() => fetchPortfolio()} disabled={loading}><RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} /></button>
                           <button className="p-2 text-gray-400 hover:text-red-400" title="Disconnect" onClick={disconnectWallet}><LogOut className="w-5 h-5" /></button>
                         </div>
                       </div>
                       {/* Address with copy */}
                       <div className="flex items-center gap-2 mb-4">
                         <span className="font-mono text-white text-lg">{shortenAddress(walletAddress)}</span>
                         <button className="p-1 text-gray-400 hover:text-blue-400" onClick={handleCopy} title="Copy address">
                           <Copy className="w-4 h-4" />
                         </button>
                         {copySuccess && <span className="text-xs text-green-400 ml-2">Copied!</span>}
                       </div>
                       {/* Network, balance, status */}
                       <div className="mb-4 space-y-1">
                         <div className="text-sm text-blue-200">Network: <span className="font-semibold text-white">{chainName || 'Unknown'}</span></div>
                         <div className="text-sm text-blue-200">ETH Balance: <span className="font-semibold text-white">{ethBalance ? `${ethBalance}` : '-'}</span></div>
                         <div className="text-sm text-blue-200">Status: <span className="font-semibold text-green-400">{isConnected ? 'Connected' : 'Not Connected'}</span></div>
                       </div>
                     </div>
                     <button
                       className={`absolute top-6 -left-10 text-white/80 hover:text-blue-400 text-3xl font-bold cursor-pointer p-0 m-0 bg-transparent border-none outline-none drop-shadow-lg transition-all duration-300 ${walletMenuOpen && isConnected ? 'opacity-100 pointer-events-auto translate-x-0' : 'opacity-0 pointer-events-none translate-x-full'}`}
                       onClick={() => setWalletMenuOpen(false)}
                       aria-label="Close wallet panel"
                       style={{ zIndex: 1 }}
                     >
                       <ChevronRight className="w-8 h-8" />
                     </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </nav>

        <Routes>
          <Route path="/" element={<BlankPage title="Home" />} />
          <Route path="/portfolio" element={<PortfolioPage portfolio={portfolio} loading={loading} fetchPortfolio={() => fetchPortfolio(walletAddress)} error={error} />} />
          <Route path="/strategies" element={<BlankPage title="Strategies" />} />
          <Route path="/chat" element={<BlankPage title="Chat" />} />
        </Routes>

        {loading && !portfolio && (
          <div className="text-center py-12">
            <RefreshCw className="w-8 h-8 text-blue-400 animate-spin mx-auto mb-4" />
            <p className="text-blue-200">Fetching your portfolio...</p>
          </div>
        )}

        {/* Error State */}
        {error && !loading && (
          <div className="max-w-md mx-auto text-center">
            <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-6">
              <p className="text-red-400">{error}</p>
            </div>
          </div>
        )}
      </div>
  );
};

// Helper: MetaMask logo image
const MetaMaskLogo = () => (
  <img src="https://images.ctfassets.net/clixtyxoaeas/4rnpEzy1ATWRKVBOLxZ1Fm/a74dc1eed36d23d7ea6030383a4d5163/MetaMask-icon-fox.svg" alt="MetaMask" className="w-10 h-10 rounded-full" style={{ background: '#232323', border: '1.5px solid #444', objectFit: 'contain', boxShadow: '0 2px 8px 0 #0002' }} />
);

export default App;