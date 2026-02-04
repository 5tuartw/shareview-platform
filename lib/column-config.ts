export interface ColumnDefinition {
  field: string;
  display: string;
  type: 'text' | 'number' | 'currency' | 'percent' | 'date';
}

// All available columns (mirrors column_config.py ALL_AVAILABLE_COLUMNS)
export const ALL_AVAILABLE_COLUMNS: ColumnDefinition[] = [
  // Identity (always first)
  { field: 'retailer_name', display: 'Retailer', type: 'text' },
  { field: 'retailer_id', display: 'Ret. ID', type: 'text' },
  { field: 'category', display: 'Category', type: 'text' },
  { field: 'tier', display: 'Tier', type: 'text' },
  { field: 'status', display: 'Status', type: 'text' },
  { field: 'account_manager', display: 'Account Manager', type: 'text' },
  { field: 'high_priority', display: 'Priority', type: 'text' },
  
  // Time
  { field: 'report_month', display: 'Month', type: 'text' },
  { field: 'report_date', display: 'Report Date', type: 'date' },
  
  // Traffic metrics
  { field: 'impressions', display: 'Imp.', type: 'number' },
  { field: 'google_clicks', display: 'G. Clicks', type: 'number' },
  { field: 'network_clicks', display: 'Net. Clicks', type: 'number' },
  { field: 'assists', display: 'Assists', type: 'number' },
  
  // Conversions by transaction date
  { field: 'network_conversions_transaction', display: 'Net. Conv (Tr)', type: 'number' },
  { field: 'google_conversions_transaction', display: 'G. Conv (Tr)', type: 'number' },
  
  // Conversions by click date
  { field: 'network_conversions_click', display: 'Net. Conv (Click)', type: 'number' },
  { field: 'google_conversions_click', display: 'G. Conv (Click)', type: 'number' },
  
  // Orders
  { field: 'no_of_orders', display: 'Orders', type: 'number' },
  
  // Financial metrics
  { field: 'gmv', display: 'GMV', type: 'currency' },
  { field: 'commission_unvalidated', display: 'Comm. (Unval.)', type: 'currency' },
  { field: 'commission_validated', display: 'Comm. (Val.)', type: 'currency' },
  { field: 'validation_rate', display: '% Unval./Val. Comm.', type: 'percent' },
  { field: 'css_spend', display: 'CSS Spend', type: 'currency' },
  { field: 'profit', display: 'Profit', type: 'currency' },
  
  // Performance ratios
  { field: 'ctr', display: 'CTR', type: 'percent' },
  { field: 'cpc', display: 'CPC', type: 'currency' },
  { field: 'conversion_rate', display: 'Conv. Rate', type: 'percent' },
  { field: 'epc', display: 'EPC', type: 'currency' },
  { field: 'validated_epc', display: 'Val. EPC', type: 'currency' },
  { field: 'net_epc', display: 'Net EPC', type: 'currency' },
  { field: 'roi', display: 'ROI', type: 'percent' },
  
  // Commission rates
  { field: 'previous_commission_rate', display: 'Prev. Comm.', type: 'percent' },
  { field: 'current_commission_rate', display: 'Curr. Comm.', type: 'percent' },
  { field: 'commission_rate_target', display: 'Target Comm.', type: 'percent' },
  
  // Forecasting
  { field: 'forecasted_gmv', display: 'Forecast GMV', type: 'currency' },
  
  // Sales team specific
  { field: 'alert_count', display: 'Alerts', type: 'number' },
];

export function getColumnDefinition(field: string): ColumnDefinition | undefined {
  return ALL_AVAILABLE_COLUMNS.find(col => col.field === field);
}

export function getColumnDefinitions(fields: string[]): ColumnDefinition[] {
  return fields
    .map(field => getColumnDefinition(field))
    .filter((col): col is ColumnDefinition => col !== undefined);
}

export interface DashboardView {
  id: number;
  name: string;
  icon: string;
  is_default: boolean;
  column_order: string[];
  visible_tags: string[] | null;
  created_at: string;
  updated_at: string;
}
