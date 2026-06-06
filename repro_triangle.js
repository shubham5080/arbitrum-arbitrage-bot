const { ethers } = require('ethers');

async function main(){
  const RPC = process.env.RPC_URL;
  if(!RPC){ console.error('RPC_URL not set'); process.exit(1); }
  const provider = new ethers.JsonRpcProvider(RPC);

  const ADDRESSES = {
    USDC: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    UNISWAP_V3_FACTORY: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
    SUSHI_V3_FACTORY: '0x1af415a1EbA07a4986a52B6f2e7dE7003D82231e'
  };

  const TOKENS = {
    WBTC: { address: '0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f', decimals: 8 },
    WETH: { address: '0x82af49447d8a07e3bd95bd0d56f35241523fbab1', decimals: 18 }
  };

  const UNISWAP_QUOTER = '0x61fFE014bA17989E743c5F6cB21bF9697530B21e';
  const QUOTE_ABI = ["function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96)) external returns (uint256 amountOut)"];
  const FACTORY_ABI = ["function getPool(address,address,uint24) external view returns (address)"];
  const POOL_ABI = ["function slot0() external view returns (uint160,int24,uint16,uint16,uint16,uint8,bool)", "function token0() view returns (address)", "function token1() view returns (address)", "function getReserves() view returns (uint112,uint112,uint32)"];

  const USDC = ADDRESSES.USDC;
  const WBTC = TOKENS.WBTC.address;
  const WETH = TOKENS.WETH.address;

  const targetSizes = [100,500,1000,5000];

  for(const size of targetSizes){
    console.log('\n=== RUN size', size, '===');
    // Leg1 Uniswap USDC->WBTC
    const uniFactory = new ethers.Contract(ADDRESSES.UNISWAP_V3_FACTORY, FACTORY_ABI, provider);
    let uniPool1=null, fee1=null;
    for(const f of [500,3000,10000]){
      try{
        const pool = await uniFactory.getPool(USDC, WBTC, f);
        if(pool && pool !== ethers.ZeroAddress){ uniPool1 = pool; fee1 = f; break; }
      }catch(e){}
    }
    if(!fee1) fee1=500;
    const iface = new ethers.Interface(QUOTE_ABI);
    const amountInUnits1 = ethers.parseUnits(String(size), 6);
    const calldata1 = iface.encodeFunctionData('quoteExactInputSingle', [{tokenIn:USDC, tokenOut:WBTC, amountIn:amountInUnits1, fee: fee1, sqrtPriceLimitX96:0n}]);
    let raw1=null; let decoded1=null; let out1=null;
    try{ raw1 = await provider.call({to: UNISWAP_QUOTER, data: calldata1}); decoded1 = iface.decodeFunctionResult('quoteExactInputSingle', raw1)[0]; out1 = ethers.formatUnits(decoded1, TOKENS.WBTC.decimals);}catch(e){console.error('leg1 call failed',e)}
    console.log('Leg1', {tokenIn:USDC, tokenOut:WBTC, dex:'uniswap', poolAddress: uniPool1||'N/A', fee:fee1, amountIn:size, amountOut:out1});

    // Leg2 Sushi WBTC->WETH via sushi v3 factory lookup
    const sushiFactory = new ethers.Contract(ADDRESSES.SUSHI_V3_FACTORY, FACTORY_ABI, provider);
    let sushiPool=null, sushiFee=null;
    for(const f of [500,3000,10000]){
      try{ const p = await sushiFactory.getPool(WBTC, WETH, f); if(p && p !== ethers.ZeroAddress){ sushiPool=p; sushiFee=f; break; }}catch(e){}
    }
    let out2=null; let raw2=null; let isV3=false; let poolInfo=null;
    if(sushiPool){
      const pc = new ethers.Contract(sushiPool, POOL_ABI, provider);
      try{ await pc.slot0(); isV3=true;}catch(e){isV3=false}
      if(isV3){
        // call quoter
        try{
          const amountInUnits2 = ethers.parseUnits(String(Number(out1)), TOKENS.WBTC.decimals);
          const calldata2 = iface.encodeFunctionData('quoteExactInputSingle', [{tokenIn:WBTC, tokenOut:WETH, amountIn: amountInUnits2, fee: sushiFee, sqrtPriceLimitX96:0n}]);
          raw2 = await provider.call({to: UNISWAP_QUOTER, data: calldata2});
          const decoded2 = iface.decodeFunctionResult('quoteExactInputSingle', raw2)[0];
          out2 = ethers.formatUnits(decoded2, TOKENS.WETH.decimals);
        }catch(e){ console.error('sushi v3 quote failed',e)}
      } else {
        // v2 pair: getReserves
        try{ const reserves = await pc.getReserves(); const tok0 = await pc.token0(); const tok1 = await pc.token1(); poolInfo={reserves, tok0, tok1};
          // compute v2 amount out
          const amountInUnits2 = ethers.parseUnits(String(Number(out1)), TOKENS.WBTC.decimals);
          let reserveIn, reserveOut;
          if(tok0.toLowerCase()===WBTC.toLowerCase() && tok1.toLowerCase()===WETH.toLowerCase()){ reserveIn = BigInt(reserves[0].toString()); reserveOut = BigInt(reserves[1].toString()); }
          else if(tok1.toLowerCase()===WBTC.toLowerCase() && tok0.toLowerCase()===WETH.toLowerCase()){ reserveIn = BigInt(reserves[1].toString()); reserveOut = BigInt(reserves[0].toString()); }
          else { throw new Error('pair tokens mismatch'); }
          const amountInWithFee = amountInUnits2 * 997n;
          const numerator = amountInWithFee * reserveOut;
          const denominator = reserveIn * 1000n + amountInWithFee;
          const amountOutBig = numerator / denominator;
          out2 = ethers.formatUnits(amountOutBig, TOKENS.WETH.decimals);
          raw2 = poolInfo;
        }catch(e){ console.error('sushi v2 handling failed',e)}
      }
    } else {
      console.log('No sushi pool found via SUSHI_V3_FACTORY for WBTC-WETH');
    }
    console.log('Leg2', {tokenIn:WBTC, tokenOut:WETH, dex:'sushi', poolAddress: sushiPool||'N/A', fee: sushiFee||'N/A', amountIn: out1, amountOut: out2, isV3});

    // Leg3 Uniswap WETH->USDC
    let uniPool3=null, fee3=null;
    for(const f of [500,3000,10000]){
      try{ const p = await uniFactory.getPool(WETH, USDC, f); if(p && p !== ethers.ZeroAddress){ uniPool3=p; fee3=f; break; }}catch(e){}
    }
    if(!fee3) fee3=500;
    let out3=null; let raw3=null;
    try{
      const amountInUnits3 = ethers.parseUnits(String(out2 || 0), TOKENS.WETH.decimals);
      const calldata3 = iface.encodeFunctionData('quoteExactInputSingle', [{tokenIn:WETH, tokenOut:USDC, amountIn: amountInUnits3, fee: fee3, sqrtPriceLimitX96:0n}]);
      raw3 = await provider.call({to: UNISWAP_QUOTER, data: calldata3});
      const decoded3 = iface.decodeFunctionResult('quoteExactInputSingle', raw3)[0];
      out3 = ethers.formatUnits(decoded3, 6);
    }catch(e){ console.error('leg3 failed',e)}
    console.log('Leg3', {tokenIn:WETH, tokenOut:USDC, dex:'uniswap', poolAddress: uniPool3||'N/A', fee: fee3, amountIn: out2, amountOut: out3});

    console.log('FINAL:', {initialUSDC:size, finalUSDC: out3, grossProfit: out3? (Number(out3)-size).toFixed(6): 'err'});
  }
}

main().catch(e=>{console.error(e); process.exit(1);});
