import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'; // v18.2.0
import { Area, AreaChart, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine, Legend } from 'recharts'; // v2.7.0
import { cn } from 'class-variance-authority'; // v0.7.0
import debounce from 'lodash/debounce'; // v4.17.21

import { useCrypto } from '../../hooks/useCrypto';
import { PriceData } from '../../types/crypto';
import { formatPercentage } from '../../utils/format';

// Chart configuration constants
const TIMEFRAMES = ['1H', '24H', '7D', '30D', '1Y'] as const;
type Timeframe = typeof TIMEFRAMES[number];

const CHART_COLORS = {
  positive: '#10B981',
  negative: '#EF4444',
  volume: '#6B7280',
  ma20: '#60A5FA',
  ma50: '#818CF8',
  rsi: '#F472B6'
} as const;

const TECHNICAL_INDICATORS = {
  MA_PERIODS: [20, 50],
  RSI_PERIOD: 14,
  VOLUME_OPACITY: 0.3
} as const;

interface PriceChartProps {
  currency: CryptoCurrency;
  timeframe?: Timeframe;
  showVolume?: boolean;
  showIndicators?: boolean;
  className?: string;
}

interface ChartData {
  timestamp: number;
  price: number;
  volume: number;
  ma20?: number;
  ma50?: number;
  rsi?: number;
}

const PriceChart: React.FC<PriceChartProps> = React.memo(({
  currency,
  timeframe = '24H',
  showVolume = true,
  showIndicators = true,
  className
}) => {
  // State management
  const [chartData, setChartData] = useState<ChartData[]>([]);
  const [chartDimensions, setChartDimensions] = useState({ width: 0, height: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Refs for performance optimization
  const chartRef = useRef<HTMLDivElement>(null);
  const resizeObserver = useRef<ResizeObserver | null>(null);

  // Custom hooks
  const { prices, loading, subscribeToUpdates } = useCrypto();

  // Calculate chart color based on price movement
  const chartColor = useMemo(() => {
    if (chartData.length < 2) return CHART_COLORS.positive;
    const firstPrice = chartData[0].price;
    const lastPrice = chartData[chartData.length - 1].price;
    return lastPrice >= firstPrice ? CHART_COLORS.positive : CHART_COLORS.negative;
  }, [chartData]);

  // Calculate technical indicators
  const calculateIndicators = useCallback((data: ChartData[]): ChartData[] => {
    if (!showIndicators || data.length < TECHNICAL_INDICATORS.MA_PERIODS[1]) {
      return data;
    }

    return data.map((point, index) => {
      // Calculate Moving Averages
      const ma20 = index >= TECHNICAL_INDICATORS.MA_PERIODS[0] ?
        data.slice(index - TECHNICAL_INDICATORS.MA_PERIODS[0], index)
          .reduce((sum, p) => sum + p.price, 0) / TECHNICAL_INDICATORS.MA_PERIODS[0] : undefined;

      const ma50 = index >= TECHNICAL_INDICATORS.MA_PERIODS[1] ?
        data.slice(index - TECHNICAL_INDICATORS.MA_PERIODS[1], index)
          .reduce((sum, p) => sum + p.price, 0) / TECHNICAL_INDICATORS.MA_PERIODS[1] : undefined;

      // Calculate RSI
      const rsi = index >= TECHNICAL_INDICATORS.RSI_PERIOD ? calculateRSI(
        data.slice(index - TECHNICAL_INDICATORS.RSI_PERIOD, index + 1)
      ) : undefined;

      return { ...point, ma20, ma50, rsi };
    });
  }, [showIndicators]);

  // Process and format price data for chart
  const processChartData = useCallback((priceData: PriceData[]) => {
    const filteredData = priceData
      .filter(p => p.currency === currency)
      .map(p => ({
        timestamp: new Date(p.last_updated).getTime(),
        price: parseFloat(p.price_usd),
        volume: parseFloat(p.volume_24h)
      }))
      .sort((a, b) => a.timestamp - b.timestamp);

    return calculateIndicators(filteredData);
  }, [currency, calculateIndicators]);

  // Debounced chart update to handle high-frequency data
  const updateChartData = useMemo(() => debounce((newData: PriceData[]) => {
    setChartData(processChartData(newData));
    setIsLoading(false);
  }, 100), [processChartData]);

  // Handle WebSocket price updates
  useEffect(() => {
    const unsubscribe = subscribeToUpdates((data: PriceData[]) => {
      updateChartData(data);
    });

    return () => {
      unsubscribe();
      updateChartData.cancel();
    };
  }, [subscribeToUpdates, updateChartData]);

  // Initialize resize observer
  useEffect(() => {
    if (!chartRef.current) return;

    resizeObserver.current = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      setChartDimensions({ width, height });
    });

    resizeObserver.current.observe(chartRef.current);

    return () => {
      resizeObserver.current?.disconnect();
    };
  }, []);

  // Custom tooltip component
  const CustomTooltip: React.FC<any> = ({ active, payload }) => {
    if (!active || !payload?.length) return null;

    const data = payload[0].payload;
    return (
      <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {new Date(data.timestamp).toLocaleString()}
        </p>
        <p className="font-semibold">
          Price: ${data.price.toLocaleString()}
        </p>
        {showVolume && (
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Volume: ${data.volume.toLocaleString()}
          </p>
        )}
        {showIndicators && (
          <>
            {data.ma20 && (
              <p className="text-sm" style={{ color: CHART_COLORS.ma20 }}>
                MA20: ${data.ma20.toLocaleString()}
              </p>
            )}
            {data.ma50 && (
              <p className="text-sm" style={{ color: CHART_COLORS.ma50 }}>
                MA50: ${data.ma50.toLocaleString()}
              </p>
            )}
            {data.rsi && (
              <p className="text-sm" style={{ color: CHART_COLORS.rsi }}>
                RSI: {formatPercentage(data.rsi)}
              </p>
            )}
          </>
        )}
      </div>
    );
  };

  if (error) {
    return (
      <div className="flex items-center justify-center h-64 bg-red-50 dark:bg-red-900/20 rounded-lg">
        <p className="text-red-600 dark:text-red-400">{error}</p>
      </div>
    );
  }

  return (
    <div
      ref={chartRef}
      className={cn(
        "w-full h-[400px] bg-white dark:bg-gray-800 rounded-lg p-4",
        className
      )}
    >
      {isLoading ? (
        <div className="flex items-center justify-center h-full">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={chartColor} stopOpacity={0.3} />
                <stop offset="95%" stopColor={chartColor} stopOpacity={0} />
              </linearGradient>
            </defs>
            
            <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
            
            <XAxis
              dataKey="timestamp"
              tickFormatter={(timestamp) => new Date(timestamp).toLocaleTimeString()}
              stroke="#6B7280"
            />
            
            <YAxis
              yAxisId="price"
              orientation="right"
              tickFormatter={(value) => `$${value.toLocaleString()}`}
              stroke="#6B7280"
            />
            
            {showVolume && (
              <YAxis
                yAxisId="volume"
                orientation="left"
                tickFormatter={(value) => `$${(value / 1000000).toFixed(0)}M`}
                stroke={CHART_COLORS.volume}
              />
            )}
            
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            
            {showVolume && (
              <Area
                yAxisId="volume"
                type="monotone"
                dataKey="volume"
                fill={CHART_COLORS.volume}
                opacity={TECHNICAL_INDICATORS.VOLUME_OPACITY}
                stroke="none"
              />
            )}
            
            <Area
              yAxisId="price"
              type="monotone"
              dataKey="price"
              stroke={chartColor}
              fill="url(#colorPrice)"
            />
            
            {showIndicators && (
              <>
                <Area
                  yAxisId="price"
                  type="monotone"
                  dataKey="ma20"
                  stroke={CHART_COLORS.ma20}
                  dot={false}
                  fill="none"
                />
                
                <Area
                  yAxisId="price"
                  type="monotone"
                  dataKey="ma50"
                  stroke={CHART_COLORS.ma50}
                  dot={false}
                  fill="none"
                />
                
                <ReferenceLine
                  y={70}
                  yAxisId="price"
                  label="Overbought"
                  stroke={CHART_COLORS.rsi}
                  strokeDasharray="3 3"
                />
                
                <ReferenceLine
                  y={30}
                  yAxisId="price"
                  label="Oversold"
                  stroke={CHART_COLORS.rsi}
                  strokeDasharray="3 3"
                />
              </>
            )}
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
});

// Helper function to calculate RSI
function calculateRSI(data: ChartData[]): number {
  let gains = 0;
  let losses = 0;

  for (let i = 1; i < data.length; i++) {
    const difference = data[i].price - data[i - 1].price;
    if (difference >= 0) {
      gains += difference;
    } else {
      losses -= difference;
    }
  }

  const avgGain = gains / TECHNICAL_INDICATORS.RSI_PERIOD;
  const avgLoss = losses / TECHNICAL_INDICATORS.RSI_PERIOD;
  
  if (avgLoss === 0) return 100;
  
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

PriceChart.displayName = 'PriceChart';

export default PriceChart;