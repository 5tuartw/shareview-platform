// Activity logging utility for audit trail
// Logs authentication events and user actions to activity_log table

import { query } from './db';

export type ActivityAction = 
  | 'login' 
  | 'logout' 
  | 'login_failed'
  | 'user_created'
  | 'user_updated'
  | 'user_deleted'
  | 'client_viewed'
  | 'client_switched'
  | 'retailer_viewed'
  | 'config_updated'
  | 'access_granted'
  | 'access_revoked';

interface LogActivityParams {
  userId: number;
  action: ActivityAction;
  details?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  retailerId?: string;
  entityType?: string;
  entityId?: string;
}

/**
 * Log an activity to the activity_log table
 * @param params Activity details to log
 */
export async function logActivity(params: LogActivityParams): Promise<void> {
  const {
    userId,
    action,
    details = {},
    ipAddress,
    userAgent,
    retailerId,
    entityType,
    entityId,
  } = params;

  let safeRetailerId: string | null | undefined = retailerId || null;
  let enrichedDetails = details;

  if (retailerId) {
    try {
      const retailerCheck = await query('SELECT 1 FROM retailer_metadata WHERE retailer_id = $1', [retailerId]);
      if (retailerCheck.rows.length === 0) {
        safeRetailerId = null;
        enrichedDetails = { ...details, retailer_id_missing: retailerId };
      }
    } catch (checkError) {
      console.warn('Failed to validate retailer_id for activity log:', checkError);
      safeRetailerId = null;
      enrichedDetails = { ...details, retailer_id_missing: retailerId };
    }
  }

  try {
    await query(
      `INSERT INTO activity_log 
        (user_id, action, details, ip_address, user_agent, retailer_id, entity_type, entity_id, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
      [
        userId,
        action,
        JSON.stringify(enrichedDetails),
        ipAddress || null,
        userAgent || null,
        safeRetailerId || null,
        entityType || null,
        entityId || null,
      ]
    );
  } catch (error) {
    const pgError = error as { code?: string };
    if (pgError?.code === '23503' && retailerId) {
      try {
        await query(
          `INSERT INTO activity_log 
            (user_id, action, details, ip_address, user_agent, retailer_id, entity_type, entity_id, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
          [
            userId,
            action,
            JSON.stringify({ ...enrichedDetails, retailer_id_missing: retailerId }),
            ipAddress || null,
            userAgent || null,
            null,
            entityType || null,
            entityId || null,
          ]
        );
        return;
      } catch (retryError) {
        console.error('Failed to log activity after retry:', retryError);
        return;
      }
    }
    console.error('Failed to log activity:', error);
  }
}

/**
 * Log a failed login attempt (no userId available)
 * Skips database logging since we don't have a valid user_id
 * Failed attempts should be logged to application logs instead
 */
export async function logFailedLogin(
  email: string,
  ipAddress?: string,
  userAgent?: string
): Promise<void> {
  // Log to console for failed login attempts
  // activity_log table requires valid user_id foreign key, so we can't log failed attempts there
  console.warn('Failed login attempt:', {
    attempted_email: email,
    ip_address: ipAddress,
    user_agent: userAgent,
    timestamp: new Date().toISOString(),
  });
}
