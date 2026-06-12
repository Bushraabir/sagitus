//lib/analytics/holtWinters.ts

/**
 * ============================================================================
 * HOLT-WINTERS TRIPLE EXPONENTIAL SMOOTHING - DEMAND FORECASTING
 * ============================================================================
 * 
 * This module implements the Holt-Winters algorithm for time series forecasting.
 * It extends basic exponential smoothing by capturing three components:
 * 1. Level (Base value)
 * 2. Trend (Upward or downward slope)
 * 3. Seasonality (Repeating patterns over a fixed period)
 * 
 * MATHEMATICAL FOUNDATION (Additive Seasonality):
 * - Level:      l_t = α(y_t - s_{t-m}) + (1 - α)(l_{t-1} + b_{t-1})
 * - Trend:      b_t = β(l_t - l_{t-1}) + (1 - β)b_{t-1}
 * - Seasonality: s_t = γ(y_t - l_t) + (1 - γ)s_{t-m}
 * - Forecast:   ŷ_{t+h} = l_t + h·b_t + s_{t-m+h_m^+}
 * 
 * Where:
 * - α (alpha) = Level smoothing factor (0 to 1)
 * - β (beta)  = Trend smoothing factor (0 to 1)
 * - γ (gamma) = Seasonal smoothing factor (0 to 1)
 * - m         = Season length (e.g., 12 for monthly data with yearly seasonality)
 * 
 * SPECIAL FEATURE: Festival & Occasion Boost
 * Integrates a multiplier system to account for known sales spikes during
 * festivals (Eid, Pohela Boishakh, Valentine's Day, etc.), ensuring the
 * admin panel predicts stock-outs accurately during high-demand periods.
 * 
 * USAGE:
 * const model = fitHoltWinters(historicalData, { seasonLength: 12 });
 * const forecast = forecastHoltWinters(model, 3, festivalEvents);
 * ============================================================================
 */

// ─── Types & Interfaces ─────────────────────────────────────────────────────

export interface TimeSeriesPoint {
  date: string // ISO date string (YYYY-MM-DD)
  value: number // Sales volume, revenue, or units sold
}

export interface FestivalEvent {
  name: string
  startDate: string // ISO date string
  endDate: string   // ISO date string
  boostFactor: number // e.g., 1.5 means 50% increase in sales
}

export interface HoltWintersConfig {
  alpha: number   // Level smoothing factor (default: 0.2)
  beta: number    // Trend smoothing factor (default: 0.1)
  gamma: number   // Seasonal smoothing factor (default: 0.1)
  seasonLength: number // Number of periods in a season (e.g., 12 for months, 7 for days of week)
  additive: boolean // true = Additive seasonality, false = Multiplicative
}

export interface HoltWintersModel {
  level: number[]
  trend: number[]
  seasonal: number[]
  fittedValues: number[]
  residuals: number[]
  config: HoltWintersConfig
  lastLevel: number
  lastTrend: number
  lastSeasonalIndex: number
}

export interface ForecastPoint {
  date: string
  predictedValue: number
  lowerBound: number
  upperBound: number
  isFestivalPeriod: boolean
  festivalName?: string
  boostApplied: number
}

export interface DemandForecastResult {
  forecast: ForecastPoint[]
  model: HoltWintersModel
  stockOutRisk: 'low' | 'medium' | 'high'
  recommendedRestock: number
}

// ─── Default Configuration ─────────────────────────────────────────────────

const DEFAULT_CONFIG: HoltWintersConfig = {
  alpha: 0.2,
  beta: 0.1,
  gamma: 0.1,
  seasonLength: 12, // Default to 12 months for yearly seasonality
  additive: true,
}

// ── Helper Functions ───────────────────────────────────────────────────────

/**
 * Calculate the number of days between two ISO date strings
 */
function daysBetween(date1: string, date2: string): number {
  const d1 = new Date(date1)
  const d2 = new Date(date2)
  const diffTime = Math.abs(d2.getTime() - d1.getTime())
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24))
}

/**
 * Add days to an ISO date string and return a new ISO date string
 */
function addDays(dateString: string, days: number): string {
  const date = new Date(dateString)
  date.setDate(date.getDate() + days)
  return date.toISOString().split('T')[0]
}

/**
 * Check if a date falls within a festival period
 */
function isFestivalDate(date: string, festivals: FestivalEvent[]): FestivalEvent | null {
  const targetTime = new Date(date).getTime()
  for (const festival of festivals) {
    const start = new Date(festival.startDate).getTime()
    const end = new Date(festival.endDate).getTime()
    if (targetTime >= start && targetTime <= end) {
      return festival
    }
  }
  return null
}

// ─── Core Holt-Winters Algorithm ───────────────────────────────────────────

/**
 * Initialize the Holt-Winters model components.
 * 
 * Uses simple averages for the first season to establish baseline
 * level, trend, and seasonal indices.
 */
function initializeModel(
  data: number[],
  config: HoltWintersConfig
): { level: number[]; trend: number[]; seasonal: number[] } {
  const m = config.seasonLength
  const n = data.length
  
  const level: number[] = new Array(n).fill(0)
  const trend: number[] = new Array(n).fill(0)
  const seasonal: number[] = new Array(n).fill(0)

  // Initialize Level: Average of the first season
  const firstSeasonSum = data.slice(0, m).reduce((sum, val) => sum + val, 0)
  level[0] = firstSeasonSum / m

  // Initialize Trend: Average difference between first and second season
  if (n >= 2 * m) {
    const secondSeasonSum = data.slice(m, 2 * m).reduce((sum, val) => sum + val, 0)
    trend[0] = (secondSeasonSum / m - firstSeasonSum / m) / m
  } else {
    trend[0] = 0
  }

  // Initialize Seasonal Indices
  for (let i = 0; i < m; i++) {
    if (config.additive) {
      seasonal[i] = data[i] - level[0]
    } else {
      // Multiplicative: avoid division by zero
      seasonal[i] = level[0] !== 0 ? data[i] / level[0] : 1
    }
  }

  // If we have more than one season, average the seasonal indices
  if (n > m) {
    for (let i = 0; i < m; i++) {
      let sum = seasonal[i]
      let count = 1
      for (let j = 1; j < Math.floor(n / m); j++) {
        const idx = j * m + i
        if (idx < n) {
          if (config.additive) {
            sum += data[idx] - (level[0] + j * trend[0])
          } else {
            const expected = level[0] + j * trend[0]
            sum += expected !== 0 ? data[idx] / expected : 1
          }
          count++
        }
      }
      seasonal[i] = sum / count
    }
  }

  return { level, trend, seasonal }
}

/**
 * Fit the Holt-Winters model to historical data.
 * 
 * @param data - Array of historical values (e.g., monthly sales)
 * @param config - Smoothing parameters and season length
 * @returns Fitted HoltWintersModel
 */
export function fitHoltWinters(
  data: number[],
  config: Partial<HoltWintersConfig> = {}
): HoltWintersModel {
  const cfg = { ...DEFAULT_CONFIG, ...config }
  const n = data.length
  const m = cfg.seasonLength

  // Fallback: If data is shorter than season length, use Double Exponential Smoothing
  if (n < m) {
    console.warn(`[HoltWinters] Data length (${n}) is less than season length (${m}). Falling back to Holt's Double Exponential Smoothing.`)
    return fitHoltDouble(data, cfg)
  }

  const { level, trend, seasonal } = initializeModel(data, cfg)
  const fittedValues: number[] = new Array(n).fill(0)
  const residuals: number[] = new Array(n).fill(0)

  // Fill in initial fitted values
  for (let i = 0; i < m; i++) {
    fittedValues[i] = data[i] // Initial season fitted values are just the actuals for simplicity
    residuals[i] = 0
  }

  // Iterate through the rest of the data
  for (let t = m; t < n; t++) {
    const y = data[t]
    const s = seasonal[t - m]
    const l_prev = level[t - 1]
    const b_prev = trend[t - 1]

    // Calculate fitted value for previous period (for residual calculation)
    if (cfg.additive) {
      fittedValues[t] = l_prev + b_prev + s
    } else {
      fittedValues[t] = (l_prev + b_prev) * s
    }
    residuals[t] = y - fittedValues[t]

    // Update Level
    if (cfg.additive) {
      level[t] = cfg.alpha * (y - s) + (1 - cfg.alpha) * (l_prev + b_prev)
    } else {
      level[t] = cfg.alpha * (y / s) + (1 - cfg.alpha) * (l_prev + b_prev)
    }

    // Update Trend
    trend[t] = cfg.beta * (level[t] - l_prev) + (1 - cfg.beta) * b_prev

    // Update Seasonality
    if (cfg.additive) {
      seasonal[t] = cfg.gamma * (y - level[t]) + (1 - cfg.gamma) * s
    } else {
      seasonal[t] = cfg.gamma * (y / level[t]) + (1 - cfg.gamma) * s
    }
  }

  return {
    level,
    trend,
    seasonal,
    fittedValues,
    residuals,
    config: cfg,
    lastLevel: level[n - 1],
    lastTrend: trend[n - 1],
    lastSeasonalIndex: (n - 1) % m,
  }
}

/**
 * Fallback: Holt's Double Exponential Smoothing (No Seasonality)
 * Used when historical data is insufficient for seasonal modeling.
 */
function fitHoltDouble(
  data: number[],
  config: HoltWintersConfig
): HoltWintersModel {
  const n = data.length
  const level: number[] = new Array(n).fill(0)
  const trend: number[] = new Array(n).fill(0)
  const seasonal: number[] = new Array(n).fill(1) // No seasonality
  const fittedValues: number[] = new Array(n).fill(0)
  const residuals: number[] = new Array(n).fill(0)

  level[0] = data[0]
  trend[0] = n > 1 ? data[1] - data[0] : 0

  for (let t = 1; t < n; t++) {
    const y = data[t]
    fittedValues[t] = level[t - 1] + trend[t - 1]
    residuals[t] = y - fittedValues[t]

    level[t] = config.alpha * y + (1 - config.alpha) * (level[t - 1] + trend[t - 1])
    trend[t] = config.beta * (level[t] - level[t - 1]) + (1 - config.beta) * trend[t - 1]
  }

  return {
    level,
    trend,
    seasonal,
    fittedValues,
    residuals,
    config,
    lastLevel: level[n - 1],
    lastTrend: trend[n - 1],
    lastSeasonalIndex: 0,
  }
}

/**
 * Generate future forecasts using the fitted model.
 * 
 * @param model - Fitted HoltWintersModel
 * @param periods - Number of future periods to forecast
 * @param festivals - Array of festival events to apply sales boosts
 * @param startDate - The date of the first forecast period (ISO string)
 * @param periodDays - Number of days per period (default: 30 for monthly)
 * @returns Array of ForecastPoint objects
 */
export function forecastHoltWinters(
  model: HoltWintersModel,
  periods: number,
  festivals: FestivalEvent[] = [],
  startDate: string = new Date().toISOString().split('T')[0],
  periodDays: number = 30
): ForecastPoint[] {
  const { lastLevel, lastTrend, lastSeasonalIndex, config } = model
  const m = config.seasonLength
  const forecast: ForecastPoint[] = []

  // Calculate standard deviation of residuals for confidence intervals
  const residuals = model.residuals.filter(r => r !== 0)
  const meanResidual = residuals.reduce((sum, r) => sum + r, 0) / residuals.length
  const variance = residuals.reduce((sum, r) => sum + Math.pow(r - meanResidual, 2), 0) / residuals.length
  const stdDev = Math.sqrt(variance)

  for (let h = 1; h <= periods; h++) {
    // 1. Base Forecast
    let baseForecast: number
    const seasonalIndex = (lastSeasonalIndex + h) % m
    const s = model.seasonal[model.seasonal.length - m + seasonalIndex] || 0

    if (config.additive) {
      baseForecast = lastLevel + h * lastTrend + s
    } else {
      baseForecast = (lastLevel + h * lastTrend) * (s || 1)
    }

    // Ensure forecast is not negative
    baseForecast = Math.max(0, baseForecast)

    // 2. Apply Festival Boost
    const forecastDate = addDays(startDate, (h - 1) * periodDays)
    const festival = isFestivalDate(forecastDate, festivals)
    let finalForecast = baseForecast
    let boostApplied = 1.0
    let festivalName: string | undefined

    if (festival) {
      boostApplied = festival.boostFactor
      finalForecast = baseForecast * boostApplied
      festivalName = festival.name
    }

    // 3. Calculate Confidence Intervals (95% confidence)
    // Variance increases with forecast horizon
    const horizonVariance = variance * (1 + (h * config.alpha * config.alpha))
    const marginOfError = 1.96 * Math.sqrt(horizonVariance)

    forecast.push({
      date: forecastDate,
      predictedValue: Math.round(finalForecast * 100) / 100,
      lowerBound: Math.max(0, Math.round((finalForecast - marginOfError) * 100) / 100),
      upperBound: Math.round((finalForecast + marginOfError) * 100) / 100,
      isFestivalPeriod: !!festival,
      festivalName,
      boostApplied,
    })
  }

  return forecast
}

// ─── Advanced Analytics & Stock-Out Prediction ─────────────────────────────

/**
 * Analyze forecast results to predict stock-out risks and recommend restocking.
 * 
 * @param forecast - Array of ForecastPoint objects
 * @param currentStock - Current inventory level
 * @param leadTimeDays - Supplier delivery lead time in days
 * @param periodDays - Days per forecast period
 * @returns DemandForecastResult with risk assessment
 */
export function analyzeStockOutRisk(
  forecast: ForecastPoint[],
  currentStock: number,
  leadTimeDays: number = 14,
  periodDays: number = 30
): Omit<DemandForecastResult, 'model'> {
  if (forecast.length === 0) {
    return {
      forecast: [],
      stockOutRisk: 'low',
      recommendedRestock: 0,
    }
  }

  // Calculate cumulative demand over the lead time
  const leadTimePeriods = Math.ceil(leadTimeDays / periodDays)
  let cumulativeDemand = 0
  let maxDailyDemand = 0
  let festivalDemand = 0

  forecast.slice(0, leadTimePeriods).forEach(point => {
    cumulativeDemand += point.predictedValue
    if (point.predictedValue > maxDailyDemand) {
      maxDailyDemand = point.predictedValue
    }
    if (point.isFestivalPeriod) {
      festivalDemand += point.predictedValue
    }
  })

  // Determine stock-out risk
  let stockOutRisk: 'low' | 'medium' | 'high' = 'low'
  const safetyStock = maxDailyDemand * 1.5 // 1.5 days of peak demand as safety stock
  
  if (currentStock < cumulativeDemand * 0.5) {
    stockOutRisk = 'high'
  } else if (currentStock < cumulativeDemand + safetyStock) {
    stockOutRisk = 'medium'
  }

  // Calculate recommended restock amount
  // Target: Cover lead time demand + safety stock + buffer for festivals
  const festivalBuffer = festivalDemand > 0 ? festivalDemand * 0.2 : 0
  const targetStock = cumulativeDemand + safetyStock + festivalBuffer
  const recommendedRestock = Math.max(0, Math.ceil(targetStock - currentStock))

  return {
    forecast,
    stockOutRisk,
    recommendedRestock,
  }
}

/**
 * Complete pipeline: Fit model, forecast, and analyze stock risk.
 * 
 * @param historicalData - Array of TimeSeriesPoint objects
 * @param config - Holt-Winters configuration
 * @param periodsToForecast - Number of future periods to predict
 * @param festivals - Array of upcoming festival events
 * @param currentStock - Current inventory level for the product
 * @param leadTimeDays - Supplier lead time
 * @returns Complete DemandForecastResult
 */
export function generateDemandForecast(
  historicalData: TimeSeriesPoint[],
  config: Partial<HoltWintersConfig> = {},
  periodsToForecast: number = 3,
  festivals: FestivalEvent[] = [],
  currentStock: number = 0,
  leadTimeDays: number = 14
): DemandForecastResult {
  // Extract values from time series
  const values = historicalData.map(p => p.value)
  
  // Fit the model
  const model = fitHoltWinters(values, config)
  
  // Determine the start date for forecasting (day after last historical data point)
  const lastDate = historicalData[historicalData.length - 1].date
  const startDate = addDays(lastDate, 1)
  
  // Calculate period length based on data frequency (assume monthly if dates are ~30 days apart)
  let periodDays = 30
  if (historicalData.length >= 2) {
    const d1 = new Date(historicalData[0].date)
    const d2 = new Date(historicalData[1].date)
    periodDays = Math.round(Math.abs(d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24))
  }

  // Generate forecast
  const forecast = forecastHoltWinters(model, periodsToForecast, festivals, startDate, periodDays)
  
  // Analyze stock-out risk
  const riskAnalysis = analyzeStockOutRisk(forecast, currentStock, leadTimeDays, periodDays)

  return {
    ...riskAnalysis,
    model,
  }
}
