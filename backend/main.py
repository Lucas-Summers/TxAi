from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List
import asyncio
import sys
import os
from decimal import Decimal
import json

# Import your existing portfolio class
# Make sure your portfolio.py file is in the same directory
from portfolio import TxPortfolio, Token

app = FastAPI(title="DeFi Portfolio API", version="1.0.0")

# Add CORS middleware to allow frontend connections
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],  # React dev server
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class PortfolioRequest(BaseModel):
    wallet_address: str
    min_balance: float = 0.000001

class TokenResponse(BaseModel):
    chain_id: int
    address: str
    symbol: str
    name: str
    decimals: int
    balance: str  # Use string to preserve precision
    logo_uri: str = None
    usd_price: str = None  # Use string to preserve precision
    usd_value: str = None  # Use string to preserve precision
    chain_name: str

class PortfolioResponse(BaseModel):
    wallet_address: str
    tokens: List[TokenResponse]
    total_usd_value: str
    total_tokens: int

def decimal_to_str(value: Decimal) -> str:
    """Convert Decimal to string for JSON serialization"""
    return str(value) if value is not None else None

def token_to_response(token: Token, chain_name: str) -> TokenResponse:
    """Convert Token object to TokenResponse"""
    return TokenResponse(
        chain_id=token.chain_id,
        address=token.address,
        symbol=token.symbol,
        name=token.name,
        decimals=token.decimals,
        balance=decimal_to_str(token.balance),
        logo_uri=token.logo_uri,
        usd_price=decimal_to_str(token.usd_price),
        usd_value=decimal_to_str(token.usd_value),
        chain_name=chain_name
    )

@app.get("/")
async def root():
    return {"message": "DeFi Portfolio API is running"}

@app.post("/portfolio", response_model=PortfolioResponse)
async def get_portfolio(request: PortfolioRequest):
    """Get portfolio for a given wallet address"""
    try:
        # Validate wallet address format
        if not request.wallet_address or len(request.wallet_address) != 42 or not request.wallet_address.startswith('0x'):
            raise HTTPException(status_code=400, detail="Invalid wallet address format")
        
        # Create portfolio instance
        portfolio_manager = TxPortfolio(request.wallet_address)
        
        # Get portfolio data
        tokens = portfolio_manager.get_portfolio(min_balance=Decimal(str(request.min_balance)))
        
        # Calculate total value
        total_value = Decimal("0")
        token_responses = []
        
        for token in tokens:
            chain_name = portfolio_manager.chains.get(token.chain_id, {}).get("name", f"Chain {token.chain_id}")
            token_response = token_to_response(token, chain_name)
            token_responses.append(token_response)
            
            if token.usd_value:
                total_value += token.usd_value
        
        return PortfolioResponse(
            wallet_address=request.wallet_address,
            tokens=token_responses,
            total_usd_value=decimal_to_str(total_value),
            total_tokens=len(token_responses)
        )
        
    except Exception as e:
        print(f"Error getting portfolio: {e}")
        raise HTTPException(status_code=500, detail=f"Error fetching portfolio: {str(e)}")

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "message": "API is running"}

@app.get("/chains")
async def get_supported_chains():
    """Get list of supported chains"""
    try:
        # You might want to create a minimal portfolio instance just to get chains
        # or move the chains.json loading to a separate utility
        with open('chains.json', 'r') as file:
            chains = json.load(file)
        
        chain_info = {}
        for chain_id, config in chains.items():
            chain_info[chain_id] = {
                "name": config.get("name"),
                "symbol": config.get("symbol"),
                "chain_id": int(chain_id)
            }
        
        return {"chains": chain_info}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error loading chains: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
