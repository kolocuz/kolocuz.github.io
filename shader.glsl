#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform float time;
uniform vec2 resolution;
uniform int pointerCount;
uniform vec3 pointers[10];
uniform int selectedOre;

uniform sampler2D stone;
uniform sampler2D coal_ore;
uniform sampler2D iron_ore;
uniform sampler2D lapis_ore;
uniform sampler2D gold_ore;
uniform sampler2D redstone_ore;
uniform sampler2D diamond_ore;
uniform sampler2D emerald_ore;

float hash(vec3 p) {
    return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
}

float noise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);

    float a = hash(i);
    float b = hash(i + vec3(1.0, 0.0, 0.0));
    float c = hash(i + vec3(0.0, 1.0, 0.0));
    float d = hash(i + vec3(0.0, 0.0, 1.0));
    float e = hash(i + vec3(1.0, 1.0, 0.0));
    float g = hash(i + vec3(1.0, 0.0, 1.0));
    float h = hash(i + vec3(0.0, 1.0, 1.0));
    float j = hash(i + vec3(1.0, 1.0, 1.0));

    float x1 = mix(a, b, f.x);
    float x2 = mix(c, d, f.x);
    float y1 = mix(e, g, f.x);
    float y2 = mix(h, j, f.x);

    float z1 = mix(x1, x2, f.y);
    float z2 = mix(y1, y2, f.y);

    return mix(z1, z2, f.z);
}

vec4 getTexture(vec2 uv, int oreType) {
    if (oreType < 0) return texture2D(stone, uv);
    else if (oreType == 0) return texture2D(coal_ore, uv);
    else if (oreType == 1) return texture2D(iron_ore, uv);
    else if (oreType == 2) return texture2D(lapis_ore, uv);
    else if (oreType == 3) return texture2D(gold_ore, uv);
    else if (oreType == 4) return texture2D(redstone_ore, uv);
    else if (oreType == 5) return texture2D(diamond_ore, uv);
    else if (oreType == 6) return texture2D(emerald_ore, uv);

    return vec4(1.0, 0.0, 1.0, 1.0);
}

vec3 getBlockTexture(vec3 blockId, vec2 uv) {
    float h = hash(blockId);
    float stoneThreshold = 0.94;

    if (h < stoneThreshold) {
        return getTexture(uv, -1).rgb;
    }

    float oreRandom = hash(blockId + vec3(5.0, 7.0, 11.0));
    int oreType;

    if (oreRandom < 0.45) oreType = 0;
    else if (oreRandom < 0.70) oreType = 1;
    else if (oreRandom < 0.80) oreType = 2;
    else if (oreRandom < 0.87) oreType = 3;
    else if (oreRandom < 0.94) oreType = 4;
    else if (oreRandom < 0.98) oreType = 5;
    else oreType = 6;

    float blend = hash(blockId + vec3(13.0, 17.0, 19.0));
    vec3 stoneColor = getTexture(uv, -1).rgb;
    vec3 oreColor = getTexture(uv, oreType).rgb;

    return mix(stoneColor, oreColor, 0.6 + blend * 0.4);
}

vec3 P1(float z) { return vec3(sin(z * 0.2) * 3.0, cos(z * 0.3) * 2.0, z); }
vec3 P2(float z) { return vec3(sin(z * 0.2), cos(z * 0.3) * 4.0 - 1.0, z); }
vec3 P3(float z) { return vec3(sin(z * 0.3) * 3.0, cos(z * 0.2) * 1.0 - 1.0, z); }

float map(vec3 p) {
    float d1 = length(p - P1(p.z));
    float d2 = length(p - P2(p.z));
    float d3 = length(p - P3(p.z));

    float baseDist = 1.5 - min(d1, min(d2, d3));

    if (baseDist > 2.0) return baseDist;

    // Почти незаметный овал
    float ovalFactor = 0.05;
    float zPos = p.z * 0.5;
    float sinZ = sin(zPos) * ovalFactor;
    float cosZ = cos(zPos * 0.7) * ovalFactor;

    float shapeDist = baseDist * (1.0 + sinZ * 0.1 + cosZ * 0.05);

    // Чуть более заметная шероховатость
    float roughness = noise(p * 6.0);
    roughness = roughness * 0.25; // стало 0.25 — фактура будет видна, но без булыжников

    float surfaceMask = smoothstep(0.0, 0.4, abs(baseDist));
    shapeDist += roughness * surfaceMask;

    // Редкие дырки: делаем их только там, где шум очень низкий, и неглубоко
    float crackNoise = noise(p * 1.5);
    // порог 0.15 — дырки будут только в ~15% случаев, то есть редко
    float hasHole = step(crackNoise, 0.15);

    // Глубина дырки небольшая, чтобы не было сквозных провалов
    float holeDepth = -0.35;

    shapeDist += holeDepth * hasHole * surfaceMask;

    return shapeDist;
}

void main(void) {
    vec2 uv = (gl_FragCoord.xy - resolution.xy * 0.5) / resolution.y;

    float speed = 2.0;
    float t = time * speed;
    vec3 ro = P1(t);
    vec3 fw = normalize(P1(t + 1.0) - ro);
    vec3 rt = normalize(vec3(fw.z, 0.0, -fw.x));
    vec3 up = cross(fw, rt);

    float fov = 1.2;
    vec3 rd = normalize(fw + (uv.x * rt + uv.y * up) / fov);

    float res = 0.5;
    vec3 p = floor(ro / res);
    vec3 cubo = (sign(rd) * ((p - ro / res) + 0.5) + 0.5) / abs(rd);
    float d = 0.0;
    vec3 mask;
    int i = 0;

    float maxSteps = 60.0;
    while (i++ < int(maxSteps) && map(p * res) > 0.0) {
        mask = step(cubo, cubo.yzx) * step(cubo, cubo.zxy);
        p += sign(rd) * mask;
        d = dot(cubo, mask);
        cubo += mask / abs(rd);
    }

    vec3 color = vec3(0.0);

    if (i < int(maxSteps)) {
        vec3 blockId = p;
        vec3 hitLocal = fract(ro / res + d * rd) - 0.5;

        vec2 texCoord;
        float flipU = 0.0;
        float flipV = 0.0;

        if (abs(mask.x) > 0.5) {
            texCoord = vec2(hitLocal.z, hitLocal.y);
            if (mask.x < 0.0) flipU = 1.0;
        }
        else if (abs(mask.y) > 0.5) {
            texCoord = vec2(hitLocal.x, hitLocal.z);
            if (mask.y < 0.0) flipV = 1.0;
        }
        else {
            texCoord = vec2(hitLocal.x, hitLocal.y);
            if (mask.z < 0.0) flipU = 1.0;
        }

        texCoord.x = mix(texCoord.x, 1.0 - texCoord.x, flipU);
        texCoord.y = mix(texCoord.y, 1.0 - texCoord.y, flipV);
        texCoord += 0.5;

        color = getBlockTexture(blockId, texCoord);

        float brightness = 1.5 / d;
        color *= brightness;
    }

    float fog = 1.0 - exp(-0.001 * d * d);
    color = mix(color, vec3(0.05, 0.05, 0.08), fog);

    float vignette = 1.0 - length(uv) * 0.1;
    color *= vignette;

    gl_FragColor = vec4(sqrt(clamp(color, 0.0, 1.0)), 1.0);
}
