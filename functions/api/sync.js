// Cloudflare Pages Function: /api/sync
// Handles background backup & restore with Cloudflare D1 database
// Supports persistent user_id, flexible name matching, and updating names to the latest value.

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json"
};

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: CORS_HEADERS
  });
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS
  });
}

// Helper to generate a unique user ID if none provided
function generateUserId() {
  return "usr_" + Date.now().toString(36) + "_" + Math.random().toString(36).substring(2, 9);
}

// GET: Fetch or restore backup for a user
export async function onRequestGet(context) {
  try {
    const { request, env } = context;
    if (!env || !env.DB) {
      return jsonResponse({
        success: false,
        error: "Database binding 'DB' is not configured in Cloudflare Pages."
      }, 503);
    }

    const url = new URL(request.url);
    const userId = (url.searchParams.get("userId") || "").trim();
    const rawName = (url.searchParams.get("userName") || "").trim();
    const rawPin = (url.searchParams.get("pin") || "").trim();

    if (!rawPin || rawPin.length !== 4) {
      return jsonResponse({ success: false, error: "A 4-digit PIN is required." }, 400);
    }

    let record = null;

    // 1. If persistent userId is provided, look up by userId first
    if (userId) {
      record = await env.DB.prepare(
        "SELECT id, user_id, user_name, pin, data, last_modified, updated_at FROM user_backups WHERE user_id = ?"
      ).bind(userId).first();

      if (record) {
        if (record.pin !== rawPin) {
          return jsonResponse({
            success: false,
            error: "PIN does not match this backup."
          }, 401);
        }

        // If user edited their name, update it to the latest in D1!
        if (rawName && rawName !== record.user_name) {
          await env.DB.prepare(
            "UPDATE user_backups SET user_name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
          ).bind(rawName, record.id).run();
          record.user_name = rawName;
        }
      }
    }

    // 2. If not found by userId (e.g. restoring on a new device or cleared cache)
    if (!record) {
      // Look up by PIN and case-insensitive exact name
      if (rawName) {
        record = await env.DB.prepare(
          "SELECT id, user_id, user_name, pin, data, last_modified, updated_at FROM user_backups WHERE pin = ? AND LOWER(TRIM(user_name)) = LOWER(TRIM(?))"
        ).bind(rawPin, rawName).first();
      }

      // If still not found, try flexible matching where name contains or is contained by the backup name
      if (!record && rawName) {
        record = await env.DB.prepare(
          "SELECT id, user_id, user_name, pin, data, last_modified, updated_at FROM user_backups WHERE pin = ? AND (LOWER(user_name) LIKE '%' || LOWER(?) || '%' OR LOWER(?) LIKE '%' || LOWER(user_name) || '%') ORDER BY last_modified DESC"
        ).bind(rawPin, rawName, rawName).first();
      }

      // If still not found and no other name matched, check if there's exactly one record with this PIN
      if (!record) {
        const recordsWithPin = await env.DB.prepare(
          "SELECT id, user_id, user_name, pin, data, last_modified, updated_at FROM user_backups WHERE pin = ? ORDER BY last_modified DESC"
        ).bind(rawPin).all();

        if (recordsWithPin && recordsWithPin.results && recordsWithPin.results.length === 1) {
          record = recordsWithPin.results[0];
        }
      }
    }

    if (!record) {
      // Check if this username exists with a DIFFERENT PIN so we can warn them specifically
      if (rawName) {
        const otherPin = await env.DB.prepare(
          "SELECT id FROM user_backups WHERE LOWER(TRIM(user_name)) = LOWER(TRIM(?))"
        ).bind(rawName).first();

        if (otherPin) {
          return jsonResponse({
            success: false,
            error: "PIN does not match the existing backup for this username."
          }, 401);
        }
      }

      return jsonResponse({
        success: true,
        exists: false,
        message: "No existing cloud backup found matching this PIN and name."
      });
    }

    // Verify PIN again for safety
    if (record.pin !== rawPin) {
      return jsonResponse({
        success: false,
        error: "Incorrect PIN for this backup."
      }, 401);
    }

    // Update name to the latest if the user entered a non-empty name
    if (rawName && rawName !== record.user_name) {
      await env.DB.prepare(
        "UPDATE user_backups SET user_name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
      ).bind(rawName, record.id).run();
      record.user_name = rawName;
    }

    let parsedData = null;
    try {
      parsedData = JSON.parse(record.data);
    } catch (e) {
      return jsonResponse({ success: false, error: "Corrupted backup data on server." }, 500);
    }

    return jsonResponse({
      success: true,
      exists: true,
      userId: record.user_id,
      userName: record.user_name,
      lastModified: record.last_modified,
      updatedAt: record.updated_at,
      data: parsedData
    });

  } catch (error) {
    return jsonResponse({
      success: false,
      error: error.message || "Internal server error"
    }, 500);
  }
}

// POST: Save or update cloud backup
export async function onRequestPost(context) {
  try {
    const { request, env } = context;
    if (!env || !env.DB) {
      return jsonResponse({
        success: false,
        error: "Database binding 'DB' is not configured in Cloudflare Pages."
      }, 503);
    }

    const body = await request.json().catch(() => null);
    if (!body) {
      return jsonResponse({ success: false, error: "Invalid JSON payload." }, 400);
    }

    let userId = (body.userId || "").trim();
    const rawName = (body.userName || "").trim();
    const pin = (body.pin || "").toString().trim();
    const lastModified = Number(body.lastModified) || Date.now();
    const data = body.data;

    if (!pin || pin.length !== 4) {
      return jsonResponse({ success: false, error: "A 4-digit PIN is required." }, 400);
    }

    if (!data || typeof data !== "object") {
      return jsonResponse({ success: false, error: "Tracker data payload is missing or invalid." }, 400);
    }

    if (!userId) {
      userId = generateUserId();
    }

    // Try finding existing record by user_id first
    let existing = await env.DB.prepare(
      "SELECT id, user_id, user_name, pin, last_modified FROM user_backups WHERE user_id = ?"
    ).bind(userId).first();

    // If not found by user_id, try matching by name and pin
    if (!existing && rawName) {
      existing = await env.DB.prepare(
        "SELECT id, user_id, user_name, pin, last_modified FROM user_backups WHERE pin = ? AND LOWER(TRIM(user_name)) = LOWER(TRIM(?))"
      ).bind(pin, rawName).first();
    }

    // If still not found, check if this name was previously used with a DIFFERENT PIN
    if (!existing && rawName) {
      const nameTaken = await env.DB.prepare(
        "SELECT id, pin FROM user_backups WHERE LOWER(TRIM(user_name)) = LOWER(TRIM(?))"
      ).bind(rawName).first();

      if (nameTaken && nameTaken.pin !== pin) {
        return jsonResponse({
          success: false,
          error: "PIN does not match the existing cloud backup for this username."
        }, 403);
      }
    }

    const dataJsonString = JSON.stringify(data);

    if (existing) {
      // Verify PIN
      if (existing.pin !== pin) {
        return jsonResponse({
          success: false,
          error: "PIN does not match the existing cloud backup for this account."
        }, 403);
      }

      // Check if server backup is strictly newer than what client is uploading
      if (existing.last_modified > lastModified) {
        return jsonResponse({
          success: true,
          updated: false,
          cloudNewer: true,
          cloudLastModified: existing.last_modified,
          userId: existing.user_id,
          message: "Cloud backup is newer than local data."
        });
      }

      // Update backup: updates user_name to latest, user_id, data, and timestamp!
      const currentName = rawName || existing.user_name || "User";
      const targetUserId = existing.user_id || userId;

      await env.DB.prepare(
        "UPDATE user_backups SET user_id = ?, user_name = ?, pin = ?, data = ?, last_modified = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
      ).bind(targetUserId, currentName, pin, dataJsonString, lastModified, existing.id).run();

      return jsonResponse({
        success: true,
        updated: true,
        userId: targetUserId,
        userName: currentName,
        lastModified: lastModified,
        message: "Cloud backup updated successfully."
      });

    } else {
      // Create new backup record with unique user_id
      const currentName = rawName || "User";
      await env.DB.prepare(
        "INSERT INTO user_backups (user_id, user_name, pin, data, last_modified) VALUES (?, ?, ?, ?, ?)"
      ).bind(userId, currentName, pin, dataJsonString, lastModified).run();

      return jsonResponse({
        success: true,
        created: true,
        userId: userId,
        userName: currentName,
        lastModified: lastModified,
        message: "New cloud backup created successfully."
      });
    }

  } catch (error) {
    return jsonResponse({
      success: false,
      error: error.message || "Internal server error"
    }, 500);
  }
}
