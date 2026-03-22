#!/usr/bin/env node
/**
 * Cabinet Wireframe → JSON Extractor
 * 
 * Usage: 
 *   node extract_cabinets.js <image_path> --key <your_anthropic_api_key>
 *   node extract_cabinets.js wireframe.png --key sk-ant-...
 * 
 * Or set env var:
 *   export ANTHROPIC_API_KEY=sk-ant-...
 *   node extract_cabinets.js wireframe.png
 * 
 * Outputs: extracted_spec.json + prints JSON to terminal for copy/paste
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const PROMPT = `You are a cabinet specification extraction system for professional cabinetmakers. Analyze this 2.5D wireframe image of cabinets and extract a COMPLETE structured specification.

RULES:
- Every visible cabinet unit gets an entry
- Base cabinets (floor-mounted, with toe kick) get IDs: B1, B2, B3... left to right
- Wall cabinets (upper, wall-mounted) get IDs: W1, W2, W3... left to right
- Tall cabinets (floor-to-ceiling) get IDs: T1, T2...
- Use standard cabinet widths ONLY: 9, 12, 15, 18, 21, 24, 27, 30, 33, 36, 42, 48 inches
- Standard base height: 34.5", base depth: 24", wall depth: 12"
- Identify appliance openings (range, fridge, dishwasher) — gaps with no cabinet
- Identify range hood if visible
- For each cabinet, describe the front face top-to-bottom as sections
- Determine which wall cabinets align (left edge) above which base cabinets or appliances
- EVERY cabinet MUST have: id, type, label, row, width, height, depth, face.sections[]

FACE SECTION TYPES:
- "drawer": horizontal drawer front (specify height in inches, usually 6)
- "door": cabinet door (count: 1 for single, 2 for double; hinge_side: left/right/both)
- "false_front": non-functional panel like above a sink (specify height)
- "glass_door": door with glass panel
- "open": no door, open shelf

CABINET TYPES: base, base_sink, base_drawer_bank, base_pullout, base_spice, wall, wall_bridge, wall_stacker, tall_pantry, tall_oven

Respond with ONLY valid JSON. No markdown. No explanation. Structure:
{"base_layout":[{"ref":"B1"},{"type":"appliance","id":"range","label":"Range","width":30}],"wall_layout":[{"ref":"W1"},{"type":"hood","id":"hood","label":"Hood","width":30}],"alignment":[{"wall":"W1","base":"B1"}],"cabinets":[{"id":"B1","type":"base","label":"description","row":"base","width":18,"height":34.5,"depth":24,"face":{"sections":[{"type":"drawer","count":1,"height":6},{"type":"door","count":1,"hinge_side":"left"}]}}]}`;

function getMime(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif' }[ext] || 'image/png';
}

function apiCall(apiKey, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = https.request({
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(data)
      },
      timeout: 120000
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(body) }); }
        catch (e) { reject(new Error(`Invalid JSON response: ${body.slice(0, 200)}`)); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
    req.write(data);
    req.end();
  });
}

async function main() {
  const args = process.argv.slice(2);
  
  let imagePath = null, apiKey = null, model = 'claude-sonnet-4-20250514', output = 'extracted_spec.json';
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--key' && args[i+1]) { apiKey = args[++i]; }
    else if (args[i] === '--model' && args[i+1]) { model = args[++i]; }
    else if ((args[i] === '-o' || args[i] === '--output') && args[i+1]) { output = args[++i]; }
    else if (!args[i].startsWith('--')) { imagePath = args[i]; }
  }

  if (!imagePath) {
    console.log('Usage: node extract_cabinets.js <image_path> --key <api_key>');
    console.log('       Or set ANTHROPIC_API_KEY env var');
    process.exit(1);
  }

  apiKey = apiKey || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('ERROR: Provide API key via --key or ANTHROPIC_API_KEY env var');
    console.error('  Get your key at: https://console.anthropic.com/settings/keys');
    process.exit(1);
  }

  if (!fs.existsSync(imagePath)) {
    console.error(`File not found: ${imagePath}`);
    process.exit(1);
  }

  const mime = getMime(imagePath);
  const imageB64 = fs.readFileSync(imagePath).toString('base64');
  const sizeKB = Math.round(imageB64.length * 0.75 / 1024);
  
  console.log(`Image: ${imagePath} (${mime}, ${sizeKB}KB)`);
  console.log(`Model: ${model}`);
  console.log('Calling Anthropic API...');

  const body = {
    model,
    max_tokens: 4096,
    system: PROMPT,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mime, data: imageB64 } },
        { type: 'text', text: 'Extract the complete cabinet specification from this wireframe. Return ONLY the JSON.' }
      ]
    }]
  };

  const resp = await apiCall(apiKey, body);
  
  if (resp.status !== 200) {
    console.error(`API Error ${resp.status}:`, JSON.stringify(resp.data, null, 2));
    process.exit(1);
  }
  if (resp.data.error) {
    console.error('API Error:', JSON.stringify(resp.data.error, null, 2));
    process.exit(1);
  }

  const raw = (resp.data.content || []).map(b => b.text || '').join('');
  if (!raw) { console.error('Empty response'); process.exit(1); }

  // Clean and parse
  let clean = raw.trim();
  if (clean.startsWith('```')) clean = clean.split('\n').slice(1).join('\n');
  if (clean.endsWith('```')) clean = clean.slice(0, -3);
  clean = clean.trim();

  const start = clean.indexOf('{'), end = clean.lastIndexOf('}') + 1;
  if (start < 0 || end <= start) {
    console.error('No JSON found in response:', clean.slice(0, 300));
    process.exit(1);
  }

  let spec;
  try {
    spec = JSON.parse(clean.slice(start, end));
  } catch (e) {
    console.error('JSON parse error:', e.message);
    console.error('Text:', clean.slice(start, start + 300));
    process.exit(1);
  }

  if (!spec.cabinets || !spec.cabinets.length) {
    console.error('No cabinets in response');
    process.exit(1);
  }

  // Fill defaults
  spec.cabinets.forEach(c => {
    if (!c.depth) c.depth = c.row === 'wall' ? 12 : 24;
    if (!c.height) c.height = c.row === 'wall' ? 30 : 34.5;
    if (!c.width) c.width = 24;
    if (!c.face) c.face = { sections: [{ type: 'door', count: 1 }] };
    if (!Array.isArray(c.face.sections)) c.face.sections = [{ type: 'door', count: 1 }];
  });
  if (!spec.base_layout) spec.base_layout = spec.cabinets.filter(c => c.row === 'base').map(c => ({ ref: c.id }));
  if (!spec.wall_layout) spec.wall_layout = spec.cabinets.filter(c => c.row === 'wall').map(c => ({ ref: c.id }));
  if (!spec.alignment) spec.alignment = [];

  // Summary
  const bases = spec.cabinets.filter(c => c.row === 'base');
  const walls = spec.cabinets.filter(c => c.row === 'wall');
  const apps = (spec.base_layout || []).filter(i => !i.ref);

  console.log(`\nExtracted: ${bases.length} base, ${walls.length} wall, ${apps.length} appliance openings`);
  console.log(`Alignment: ${spec.alignment.length} constraints\n`);

  console.log('BASE ROW:');
  spec.base_layout.forEach(item => {
    if (item.ref) {
      const c = spec.cabinets.find(x => x.id === item.ref);
      if (c) console.log(`  ${c.id}: ${c.type} ${c.width}"w x ${c.height}"h x ${c.depth}"d — ${c.label || ''}`);
    } else {
      console.log(`  [${(item.label || item.id || '?').toUpperCase()}] ${item.width || '?'}"`);
    }
  });

  console.log('\nWALL ROW:');
  spec.wall_layout.forEach(item => {
    if (item.ref) {
      const c = spec.cabinets.find(x => x.id === item.ref);
      if (c) console.log(`  ${c.id}: ${c.type} ${c.width}"w x ${c.height}"h x ${c.depth}"d — ${c.label || ''}`);
    } else {
      console.log(`  [${(item.label || item.id || '?').toUpperCase()}] ${item.width || '?'}"`);
    }
  });

  // Write output
  fs.writeFileSync(output, JSON.stringify(spec, null, 2));
  console.log(`\nJSON written to: ${output}`);

  console.log('\n' + '='.repeat(60));
  console.log('COPY BELOW AND PASTE INTO PART 1:');
  console.log('='.repeat(60));
  console.log(JSON.stringify(spec, null, 2));
  console.log('='.repeat(60));
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
