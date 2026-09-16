// public/_worker.js
// 公共涂鸦墙 —— 所有人共用同一块画布

// ⚠️ 清空画布用的密码，直接改成你自己想要的
const CLEAR_PASSWORD = "RUIW28997pswd";

// 单块画布最多保留多少笔画，超过就丢掉最老的一批
const MAX_STROKES = 4000;
const TRIM_TO = 3000;

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    }
  });
}

function errorResponse(message, status = 400) {
  return jsonResponse({ error: message }, status);
}

async function getStrokes(env) {
  const raw = await env.CANVAS.get("strokes");
  if (!raw) return [];
  try {
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch (e) {
    return [];
  }
}

async function saveStrokes(env, strokes) {
  await env.CANVAS.put("strokes", JSON.stringify(strokes));
}

function isValidPoint(p) {
  return (
    Array.isArray(p) &&
    p.length === 2 &&
    typeof p[0] === "number" &&
    typeof p[1] === "number" &&
    p[0] >= -10 &&
    p[0] <= 5000 &&
    p[1] >= -10 &&
    p[1] <= 5000
  );
}

function isValidStroke(s) {
  if (!s || typeof s !== "object") return false;
  if (!Array.isArray(s.points)) return false;
  if (s.points.length < 1 || s.points.length > 3000) return false;
  if (!s.points.every(isValidPoint)) return false;
  if (typeof s.color !== "string" || !/^#[0-9a-fA-F]{6}$/.test(s.color)) {
    return false;
  }
  if (typeof s.width !== "number" || s.width < 1 || s.width > 40) {
    return false;
  }
  return true;
}

async function handleApi(request, env, pathname) {
  // ---------- 获取当前画布所有笔画 ----------
  if (pathname === "/api/canvas" && request.method === "GET") {
    const strokes = await getStrokes(env);
    return jsonResponse({ strokes, count: strokes.length });
  }

  // ---------- 提交一笔新的笔画 ----------
  if (pathname === "/api/stroke" && request.method === "POST") {
    let body;
    try {
      body = await request.json();
    } catch (e) {
      return errorResponse("请求格式错误");
    }

    const stroke = {
      points: body.points,
      color: body.color,
      width: body.width
    };

    if (!isValidStroke(stroke)) {
      return errorResponse("笔画数据不合法");
    }

    stroke.ts = Date.now();

    let strokes = await getStrokes(env);
    strokes.push(stroke);

    if (strokes.length > MAX_STROKES) {
      strokes = strokes.slice(strokes.length - TRIM_TO);
    }

    await saveStrokes(env, strokes);

    return jsonResponse({ ok: true, count: strokes.length });
  }

  // ---------- 清空画布（需要密码） ----------
  if (pathname === "/api/clear" && request.method === "POST") {
    let body;
    try {
      body = await request.json();
    } catch (e) {
      return errorResponse("请求格式错误");
    }

    if (body.password !== CLEAR_PASSWORD) {
      return errorResponse("密码错误", 401);
    }

    await saveStrokes(env, []);
    return jsonResponse({ ok: true });
  }

  return errorResponse("未找到该接口", 404);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    if (request.method === "OPTIONS") {
      return jsonResponse({});
    }

    if (pathname.startsWith("/api/")) {
      try {
        return await handleApi(request, env, pathname);
      } catch (e) {
        return errorResponse("服务器内部错误: " + e.message, 500);
      }
    }

    // 非 /api/ 的请求交给静态资源处理（index.html 等）
    return env.ASSETS.fetch(request);
  }
};
