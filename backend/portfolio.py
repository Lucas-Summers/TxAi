import requests
import json
from decimal import Decimal
from typing import List, Optional
from dataclasses import dataclass
from web3 import Web3
from concurrent.futures import ThreadPoolExecutor, as_completed
import sys

@dataclass
class Token:
    """Token data structure"""
    chain_id: int
    address: str
    symbol: str
    name: str
    decimals: int
    chain_id: int
    logo_uri: str
    balance: Decimal = Decimal('0')
    usd_price: Decimal = Decimal('0')
    usd_value: Decimal = Decimal('0')


class TxPortfolio:

    # ERC-20 balanceOf function signature
    BALANCE_OF_ABI = [
        {
            "constant": True,
            "inputs": [{"name": "_owner", "type": "address"}],
            "name": "balanceOf",
            "outputs": [{"name": "balance", "type": "uint256"}],
            "type": "function"
        }
    ]
    ZERO_ADDRESS = "0x0000000000000000000000000000000000000000"
    
    def __init__(self, wallet: str):

        self.wallet = Web3.to_checksum_address(wallet)
        with open('chains.json', 'r') as file:
            chains_raw = json.load(file)
            # Convert string keys to integers for chain IDs
            self.chains = {int(k): v for k, v in chains_raw.items()}
        self.clients = self.init_clients()
        self.portfolio: List[Token] = []
        self._cmc_id_cache: dict[tuple[str, str, str], int] = {}


    def init_clients(self) -> dict[int, Web3]:
        clients = {}
        for chain_id, config in self.chains.items():
            rpc = config.get("rpc")
            try:
                w3 = Web3(Web3.HTTPProvider(rpc))
                if not w3.is_connected():
                    print(f"Could not connect to RPC for chain {chain_id} ({config['name']})")
                    continue
                clients[chain_id] = w3
                print(f"Connected to {config['name']} ({chain_id})")
            except Exception as e:
                print(f"Error connecting to chain {chain_id}: {e}")
        return clients

    
    def fetch_tokens(self) -> List[Token]:
        tokens = []

        for chain_id, config in self.chains.items():
            url = config["token_list_url"]
            try:
                print(f"Fetching token list for {config['name']} ({chain_id}) from {url}")
                response = requests.get(url, timeout=30)
                response.raise_for_status()
                data = response.json()

                for token_data in data.get("tokens", []):
                    if token_data.get("chainId") != chain_id:
                        continue
                    symbol = token_data["symbol"].upper()
                    if symbol != "DAI":
                        continue  # Only process DAI for now
                    address = token_data["address"].lower()
                    token = Token(
                        address=address,
                        symbol=symbol,
                        name=token_data["name"],
                        decimals=token_data["decimals"],
                        chain_id=chain_id,
                        logo_uri=token_data.get("logoURI", "")
                    )
                    tokens.append(token)

                # Add native token
                native_token = Token(
                    address= self.ZERO_ADDRESS,
                    symbol="ETH",
                    name="Ethereum",
                    decimals=18,
                    chain_id=chain_id,
                    logo_uri="https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png"  # Default logo for native tokens
                )
                tokens.append(native_token)

            except Exception as e:
                print(f"Error loading tokens for chain {chain_id}: {e}")

        return tokens

    def _is_native_token(self, token: Token) -> bool:
        """
        Returns True if the given token is the native token of its chain,
        based on the zero-address convention.
        """
        return token.address.lower() == self.ZERO_ADDRESS

    def get_token_balance(self, token: Token) -> Decimal:
        """Fetch wallet balance for a token"""
        try:
            w3 = self.clients.get(token.chain_id)
            if not w3:
                print(f"No Web3 client for chain {token.chain_id}")
                return Decimal("0")
            
            # Native token
            if self._is_native_token(token):
                balance_wei = w3.eth.get_balance(self.wallet)
                return Decimal(str(w3.from_wei(balance_wei, "ether")))

            # ERC-20 token
            contract = w3.eth.contract(address=Web3.to_checksum_address(token.address), abi=self.BALANCE_OF_ABI)
            raw = contract.functions.balanceOf(self.wallet).call()
            final_balance = Decimal(str(raw)) / Decimal(10 ** token.decimals)
            return final_balance

        except Exception as e:
            print(f"Error getting balance for {token.symbol} on chain {token.chain_id}: {e}")
            return Decimal("0")
    
    def _get_token_address(self, token: Token) -> str:
        """Returns the token address, wrapped if it's the native token."""
        if self._is_native_token(token):
            chain_config = self.chains.get(token.chain_id)
            return chain_config.get("wrapped_token_address", "").lower()
        return token.address.lower()


    def get_token_usd_price(self, token: Token) -> Optional[Decimal]:
        chain_config = self.chains.get(token.chain_id)
        if not chain_config:
            print(f"Chain {token.chain_id} not found in config")
            return None

        platform_slug = chain_config.get("platform_slug")
        if not platform_slug:
            print(f"Missing CoinGecko platform for chain {token.chain_id}")
            return None

        address = self._get_token_address(token)

        url = f"https://api.coingecko.com/api/v3/simple/token_price/{platform_slug}"
        params = {
            "contract_addresses": address,
            "vs_currencies": "usd"
        }

        try:
            response = requests.get(url, params=params, timeout=10)
            response.raise_for_status()
            data = response.json()
            if address in data and "usd" in data[address]:
                return Decimal(str(data[address]["usd"]))
            else:
                print(f"No price found for {token.symbol} ({address}) on {platform_slug}")
                return None
        except Exception as e:
            print(f"CoinGecko error fetching price for {token.symbol}: {e}")
            return None

    def _get_balance_and_price(self, token: Token, min_balance: Decimal) -> Optional[Token]:
        balance = self.get_token_balance(token)
        if balance <= min_balance:
            return None

        token.balance = balance
        token.usd_price = self.get_token_usd_price(token)
        if token.usd_price:
            token.usd_value = token.balance * token.usd_price

        return token

    def get_portfolio(self, min_balance: Decimal = Decimal("0.000001")) -> List[Token]:
        print("Fetching all tokens across chains...")
        tokens = self.fetch_tokens()
        self.portfolio = []

        print("Checking balances and prices in parallel...")
        with ThreadPoolExecutor(max_workers=3) as executor:
            futures = {
                executor.submit(self._get_balance_and_price, token, min_balance): token
                for token in tokens
            }
            for future in as_completed(futures):
                token = futures[future]
                try:
                    result = future.result()
                    if result:
                        self.portfolio.append(result)
                except Exception as e:
                    print(f"Error with {token.symbol} on chain {token.chain_id}: {e}")

        print(f"Found {len(self.portfolio)} tokens with non-zero balance.")
        self.portfolio.sort(key=lambda x: x.usd_value or x.balance, reverse=True)

        return self.portfolio

    def print_portfolio(self, min_balance: Decimal = Decimal("0.000001")):
        if self.portfolio == []:
            self.portfolio = self.get_portfolio(min_balance=min_balance)

        if not self.portfolio:
            print("No tokens found with balance above threshold.")
            return

        print(f"\nPortfolio for {self.wallet}")
        print("=" * 80)
        print(f"{'CHAIN':<15} {'SYMBOL':<10} {'BALANCE':>20} {'USD VALUE':>20}")
        print("-" * 80)

        total_value = Decimal("0")

        for token in self.portfolio:
            chain = self.chains[token.chain_id]["name"]
            symbol = token.symbol
            balance_str = f"{token.balance:.6f}"
            usd_str = f"${token.usd_value:,.2f}" if token.usd_value else "-"
            print(f"{chain:<15} {symbol:<10} {balance_str:>20} {usd_str:>20}")

            if token.usd_value:
                total_value += token.usd_value

        print("-" * 80)
        print(f"{'TOTAL':<15} {'':<10} {'':>20} {'$' + format(total_value, ',.2f'):>20}")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python portfolio.py <wallet_address>")
        sys.exit(1)


    portfolio = TxPortfolio(sys.argv[1])
    portfolio.print_portfolio()
