/**
 * seed.js — Datos de ejemplo para R4ce
 *
 * Crea: usuarios, tramos publicados, tiempos con splits + track GPS, grupos.
 * Ejecutar: node seed.js
 *
 * Asume backend corriendo en http://localhost:3000
 */

const API = 'http://backend:3000/api/v1';
// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

async function api(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok && res.status !== 409) {
    const text = await res.text();
    throw new Error(`${method} ${path} → ${res.status}: ${text}`);
  }
  return res.status === 204 ? null : res.json();
}

async function registerOrLogin(username, password, pseudonym) {
  try {
    const data = await api('POST', '/auth/register', { username, password, pseudonym });
    if (data.accessToken) {
      console.log(`  ✓ Registrado: ${username}`);
      return data;
    }
  } catch {}
  // Si ya existe, hacer login
  const data = await api('POST', '/auth/login', { username, password });
  console.log(`  ✓ Login: ${username}`);
  return data;
}

// Genera un track GPS sintético entre dos puntos
function generateTrack(start, end, points, durationMs) {
  const track = [];
  const now = Date.now();
  for (let i = 0; i < points; i++) {
    const t = i / (points - 1);
    // Añadir variación aleatoria para simular trayectoria real
    const jitter = (Math.random() - 0.5) * 0.0008;
    track.push({
      lat: start[0] + (end[0] - start[0]) * t + jitter,
      lng: start[1] + (end[1] - start[1]) * t + jitter,
      ts:  now + Math.floor(durationMs * t),
    });
  }
  return track;
}

// Genera splits a partir de un tiempo total y nº de checkpoints
function generateSplits(checkpoints, totalMs) {
  const splits = [];
  for (let i = 0; i < checkpoints; i++) {
    // Distribución no uniforme: más rápido al principio, más lento al final
    const ratio = Math.pow(i / (checkpoints - 1), 1.05);
    splits.push({ checkpointIndex: i, ms: Math.floor(totalMs * ratio) });
  }
  return splits;
}

// Velocidades aproximadas en km/h
function randomSpeeds(base) {
  return {
    maxSpeed: base + 15 + Math.random() * 20,
    avgSpeed: base - 5 + Math.random() * 10,
  };
}

// ─────────────────────────────────────────────
// Seed
// ─────────────────────────────────────────────

async function seed() {
  console.log('\n🏁 Sembrando datos de ejemplo en R4ce\n');

  // ── Usuarios ──
  console.log('► Usuarios');
  const users = await Promise.all([
    registerOrLogin('testuser',   'Test1234!', 'Piloto1'),
    registerOrLogin('martinez',   'Test1234!', 'Martínez'),
    registerOrLogin('garcia',     'Test1234!', 'García'),
    registerOrLogin('lopez',      'Test1234!', 'López'),
    registerOrLogin('fernandez',  'Test1234!', 'Fernández'),
    registerOrLogin('ruiz',       'Test1234!', 'Ruiz'),
    registerOrLogin('sanchez',    'Test1234!', 'Sánchez'),
    registerOrLogin('moreno',     'Test1234!', 'Moreno'),
  ]);
  const [main, ...others] = users;

  // ── Tramos ──
  console.log('\n► Tramos');
  const stagesData = [
    {
      name: 'El Pinar — Etapa 1',
      description: 'Tramo de tierra rápido con curvas de larga radio. Inicio en zona forestal.',
      difficultyLevel: 2,
      estimatedDuration: 142,
      route: [[40.5, -1.10], [40.51, -1.12], [40.52, -1.15], [40.53, -1.17]],
    },
    {
      name: 'Monte Castro',
      description: 'Asfalto de montaña con horquillas técnicas. Pendiente acumulada 280m.',
      difficultyLevel: 4,
      estimatedDuration: 215,
      route: [[40.45, -0.95], [40.46, -0.97], [40.47, -1.00], [40.48, -1.02], [40.49, -1.04]],
    },
    {
      name: 'Valle de Belmonte',
      description: 'Mixto tierra-asfalto con tramos rápidos y zona de saltos al final.',
      difficultyLevel: 3,
      estimatedDuration: 178,
      route: [[40.60, -1.25], [40.61, -1.27], [40.62, -1.29], [40.63, -1.31]],
    },
    {
      name: 'Sierra Norte',
      description: 'Tramo nocturno virado de alta dificultad. Solo para pilotos avanzados.',
      difficultyLevel: 5,
      estimatedDuration: 312,
      route: [[40.70, -1.40], [40.72, -1.42], [40.74, -1.45], [40.75, -1.48], [40.77, -1.50]],
    },
    {
      name: 'Riberas del Jiloca',
      description: 'Llano rápido junto al río. Ideal para entrenar trayectorias.',
      difficultyLevel: 1,
      estimatedDuration: 98,
      route: [[40.55, -1.20], [40.555, -1.22], [40.56, -1.24]],
    },
  ];

  const stages = [];
  for (const s of stagesData) {
    const routeGeojson = {
      type: 'LineString',
      coordinates: s.route.map(([lat, lng]) => [lng, lat]),
    };

    const { stage } = await api('POST', '/stages', {
      name:              s.name,
      description:       s.description,
      difficultyLevel:   s.difficultyLevel,
      estimatedDuration: s.estimatedDuration,
      visibility:        'private',
      routeGeojson,
    }, main.accessToken);

    // Publicar
    await api('POST', `/stages/${stage.id}/publish`, { publish: true }, main.accessToken);

    stages.push({ ...stage, route: s.route });
    console.log(`  ✓ ${s.name}`);
  }

  // ── Tiempos ──
  console.log('\n► Tiempos');
  let totalTimes = 0;

  for (const stage of stages) {
    const baseMs = stage.estimated_duration ? stage.estimated_duration * 1000 : 180000;

    // Cada usuario corre el tramo 1-2 veces
    for (const user of users) {
      const runs = 1 + Math.floor(Math.random() * 2);
      for (let i = 0; i < runs; i++) {
        // Variación: -8% a +25% del tiempo estimado
        const variation = 0.92 + Math.random() * 0.33;
        const durationMs = Math.floor(baseMs * variation);

        const start = stage.route[0];
        const end   = stage.route[stage.route.length - 1];
        const track = generateTrack(start, end, 30 + Math.floor(Math.random() * 20), durationMs);
        const splits = generateSplits(stage.route.length, durationMs);
        const speeds = randomSpeeds(60);

        await api('POST', '/times', {
          stageId:    stage.id,
          durationMs,
          visibility: 'public',
          splits,
          track,
          maxSpeed:   speeds.maxSpeed,
          avgSpeed:   speeds.avgSpeed,
        }, user.accessToken);

        totalTimes++;
      }
    }
    console.log(`  ✓ Tiempos en "${stage.name}"`);
  }

  // ── Grupos ──
  console.log('\n► Grupos');
  const groupsData = [
    { name: 'Equipo Teruel',    description: 'Pilotos de la zona de Teruel' },
    { name: 'Rally Aragón',     description: 'Comunidad oficial de Aragón' },
    { name: 'Novatos 2026',     description: 'Grupo de iniciación' },
  ];

  for (const g of groupsData) {
    const { group } = await api('POST', '/groups', g, main.accessToken);
    console.log(`  ✓ ${g.name} (invite: ${group.inviteCode})`);

    // Que se unan algunos usuarios
    const joiners = others.slice(0, 3 + Math.floor(Math.random() * 3));
    for (const u of joiners) {
      await api('POST', '/groups/join', { inviteCode: group.inviteCode }, u.accessToken);
    }
  }

  // ── Resumen ──
  console.log('\n✅ Seed completo:');
  console.log(`   ${users.length} usuarios`);
  console.log(`   ${stages.length} tramos publicados`);
  console.log(`   ${totalTimes} tiempos registrados`);
  console.log(`   ${groupsData.length} grupos`);
  console.log('\n   Credenciales del usuario principal:');
  console.log('   user: testuser   pass: Test1234!\n');
}

seed().catch((err) => {
  console.error('\n❌ Error en seed:', err.message);
  process.exit(1);
});
