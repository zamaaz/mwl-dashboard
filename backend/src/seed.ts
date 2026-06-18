import { getDb, closeDb, dbGet, dbRun, dbAll } from './database.js';
import { runMigrations } from './migrate.js';
import bcrypt from 'bcryptjs';

/**
 * Seeds the database with:
 * - MWL project data
 * - 5 disciplines
 * - 48 baseline activities (from existing Excel schedule)
 * - Default admin user
 */
async function seed(): Promise<void> {
  await runMigrations();

  // Check if already seeded
  const existing = await dbGet<{ count: number }>('SELECT COUNT(*) as count FROM projects');
  if (existing.count > 0) {
    console.log('Database already seeded. Skipping.');
    closeDb();
    return;
  }

  console.log('Seeding database...');

  // =============================================
  // 1. Create project
  // =============================================
  
  const projectResult = await dbRun(
    `INSERT INTO projects (name, code, client, contractor, baseline_start, planned_finish, total_activities, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
     ['Muslim World League — Supplementary Restoration Works', 'MWL-SRW', 'Muslim World League', 'Al-Wareef Contracting', '2026-05-16', '2026-07-16', 48, 1]
  );
  
  const projectId = projectResult.lastID;
  console.log(`  ✓ Project created (id: ${projectId})`);

  // =============================================
  // 2. Create disciplines
  // =============================================

  const disciplines = [
    { name: 'Civil Works', code: 'Civil', prefix: '1', order: 1, weight: 0 },
    { name: 'Architectural Works', code: 'Arch', prefix: '2', order: 2, weight: 0 },
    { name: 'Mechanical Works', code: 'Mech', prefix: '3', order: 3, weight: 0 },
    { name: 'Electrical Works', code: 'Elec', prefix: '4', order: 4, weight: 0 },
    { name: 'Commissioning & Handover', code: 'All', prefix: '5', order: 5, weight: 0 },
  ];

  const discIds: Record<string, number> = {};
  for (const d of disciplines) {
    const result = await dbRun(
        `INSERT INTO disciplines (project_id, name, code, wbs_prefix, sort_order, weight) VALUES (?, ?, ?, ?, ?, ?)`,
        [projectId, d.name, d.code, d.prefix, d.order, d.weight]
    );
    discIds[d.code] = result.lastID;
  }
  console.log(`  ✓ ${disciplines.length} disciplines created`);

  // =============================================
  // 3. Create baseline activities (all 48 from Excel)
  // =============================================
  
  const activities = [
    // CIVIL WORKS (1.x)
    { wbs: '1.1', name: 'Preparation and Concrete Casting of Kitchen Roof Slab', disc: 'Civil', start: '2026-06-05', finish: '2026-06-20', dur: 15, critical: 1, float: 0, remarks: 'Critical Path' },
    { wbs: '1.2', name: 'Repair / Strengthening Works', disc: 'Civil', start: '2026-06-01', finish: '2026-07-01', dur: 30, critical: 1, float: 0, remarks: 'Critical Path' },
    { wbs: '1.3', name: 'CFRP Laminates — Cracked Beams (5cm×1.2mm)', disc: 'Civil', start: '2026-06-01', finish: '2026-06-15', dur: 14, critical: 1, float: 0, remarks: 'Critical Path' },
    { wbs: '1.4', name: 'CFRP Laminates — Beams Incl. 01600', disc: 'Civil', start: '2026-06-01', finish: '2026-06-15', dur: 14, critical: 1, float: 2, remarks: null },
    { wbs: '1.5', name: 'CFRP Wraps (Min 300mm) — Incl. 01700', disc: 'Civil', start: '2026-06-01', finish: '2026-06-20', dur: 19, critical: 1, float: 3, remarks: null },
    { wbs: '1.6', name: 'Remove Fire Traces — Ceilings, Beams & Columns', disc: 'Civil', start: '2026-06-05', finish: '2026-06-15', dur: 10, critical: 0, float: 5, remarks: null },

    // ARCHITECTURAL WORKS (2.x)
    { wbs: '2.1', name: 'Blockwork / Masonry — All Floors', disc: 'Arch', start: '2026-06-06', finish: '2026-06-30', dur: 24, critical: 1, float: 0, remarks: 'Critical Path' },
    { wbs: '2.2', name: 'Cement Plastering Works — All Floors', disc: 'Arch', start: '2026-06-06', finish: '2026-07-16', dur: 40, critical: 0, float: 3, remarks: 'Ongoing' },
    { wbs: '2.3', name: 'Bathroom Waterproofing — All Floors', disc: 'Arch', start: '2026-06-26', finish: '2026-07-16', dur: 20, critical: 0, float: 0, remarks: 'Critical Path' },
    { wbs: '2.4', name: 'Roof Waterproofing — Hall & Kitchen', disc: 'Arch', start: '2026-06-26', finish: '2026-07-16', dur: 20, critical: 1, float: 0, remarks: 'Critical Path' },
    { wbs: '2.5', name: 'Roof Tiling — Hall & Kitchen', disc: 'Arch', start: '2026-07-12', finish: '2026-07-16', dur: 4, critical: 1, float: 0, remarks: 'Critical Path' },
    { wbs: '2.6', name: 'Ceramic Tiling — Bathrooms & Kitchens', disc: 'Arch', start: '2026-07-10', finish: '2026-07-16', dur: 6, critical: 1, float: 0, remarks: 'Critical Path' },
    { wbs: '2.7', name: 'Plastering Bathroom Walls (Chillers Bldg)', disc: 'Arch', start: '2026-06-10', finish: '2026-06-15', dur: 5, critical: 0, float: 5, remarks: null },
    { wbs: '2.8', name: 'Bathroom Waterproofing (Chillers Bldg)', disc: 'Arch', start: '2026-06-18', finish: '2026-06-21', dur: 3, critical: 0, float: 5, remarks: null },
    { wbs: '2.9', name: 'Bathroom Wall Tiling (Chillers Bldg)', disc: 'Arch', start: '2026-06-22', finish: '2026-06-25', dur: 3, critical: 0, float: 5, remarks: null },
    { wbs: '2.10', name: 'Bathroom Floor Tiling (Chillers Bldg)', disc: 'Arch', start: '2026-06-26', finish: '2026-06-28', dur: 2, critical: 0, float: 5, remarks: null },
    { wbs: '2.11', name: 'Terrazzo Tiles Maintenance & Polishing', disc: 'Arch', start: '2026-06-10', finish: '2026-06-13', dur: 3, critical: 0, float: 5, remarks: null },
    { wbs: '2.12', name: 'Metal Works Restoration Completion', disc: 'Arch', start: '2026-06-14', finish: '2026-06-15', dur: 1, critical: 0, float: 5, remarks: null },
    { wbs: '2.13', name: 'Internal Painting (Chillers Bldg)', disc: 'Arch', start: '2026-06-16', finish: '2026-06-19', dur: 3, critical: 0, float: 5, remarks: null },
    { wbs: '2.14', name: 'Remove & Haul Old Tiles — Bathrooms & Rooms', disc: 'Arch', start: '2026-06-06', finish: '2026-06-09', dur: 3, critical: 0, float: 3, remarks: null },
    { wbs: '2.15', name: 'Plastering — Bathroom Walls (Gate Bldg)', disc: 'Arch', start: '2026-06-15', finish: '2026-06-20', dur: 5, critical: 0, float: 3, remarks: null },
    { wbs: '2.16', name: 'Wall Tiling — Bathrooms (Gate Bldg)', disc: 'Arch', start: '2026-06-22', finish: '2026-06-25', dur: 3, critical: 0, float: 3, remarks: null },
    { wbs: '2.17', name: 'Floor Tiling — Bathrooms & Rooms (Gate Bldg)', disc: 'Arch', start: '2026-06-26', finish: '2026-06-28', dur: 2, critical: 0, float: 3, remarks: null },
    { wbs: '2.18', name: 'Doors & Windows Restoration', disc: 'Arch', start: '2026-06-30', finish: '2026-07-02', dur: 2, critical: 0, float: 3, remarks: null },
    { wbs: '2.19', name: 'Supply & Install Wooden Doors', disc: 'Arch', start: '2026-07-03', finish: '2026-07-04', dur: 1, critical: 0, float: 3, remarks: null },
    { wbs: '2.20', name: 'Supply & Install Porcelain Skirtings', disc: 'Arch', start: '2026-07-05', finish: '2026-07-06', dur: 1, critical: 0, float: 3, remarks: null },
    { wbs: '2.21', name: 'Suspended Ceiling Works', disc: 'Arch', start: '2026-07-07', finish: '2026-07-08', dur: 1, critical: 0, float: 3, remarks: null },
    { wbs: '2.22', name: 'Internal Painting (Gate Bldg)', disc: 'Arch', start: '2026-07-07', finish: '2026-07-10', dur: 3, critical: 0, float: 3, remarks: null },

    // MECHANICAL WORKS (3.x)
    { wbs: '3.1', name: 'Finalization of Shop Drawings', disc: 'Mech', start: '2026-05-16', finish: '2026-07-05', dur: 49, critical: 0, float: 5, remarks: null },
    { wbs: '3.2', name: 'Supply & Install Chillers & Pumps', disc: 'Mech', start: '2026-06-10', finish: '2026-07-10', dur: 30, critical: 0, float: 5, remarks: null },
    { wbs: '3.3', name: 'FCU Units & Ductwork Installation', disc: 'Mech', start: '2026-06-06', finish: '2026-07-30', dur: 54, critical: 0, float: 5, remarks: null },
    { wbs: '3.4', name: 'Civil Defense Firefighting Piping', disc: 'Mech', start: '2026-06-02', finish: '2026-07-07', dur: 35, critical: 0, float: 5, remarks: null },
    { wbs: '3.5', name: 'Plumbing Works Completion', disc: 'Mech', start: '2026-06-03', finish: '2026-07-15', dur: 42, critical: 1, float: 0, remarks: 'Critical Path' },
    { wbs: '3.6', name: 'Chilled Water Network Piping — Grd & 1st Flr', disc: 'Mech', start: '2026-06-07', finish: '2026-06-22', dur: 15, critical: 0, float: 5, remarks: null },
    { wbs: '3.7', name: 'Coordination Drawings Submission', disc: 'Mech', start: '2026-06-15', finish: '2026-07-05', dur: 20, critical: 0, float: 5, remarks: null },
    { wbs: '3.8', name: 'Testing Piping Networks — Chilled + Civil Def.', disc: 'Mech', start: '2026-06-20', finish: '2026-06-30', dur: 10, critical: 0, float: 5, remarks: null },
    { wbs: '3.9', name: 'Chilled Water Piping — 2nd Floor', disc: 'Mech', start: '2026-07-10', finish: '2026-08-02', dur: 23, critical: 0, float: 5, remarks: null },

    // ELECTRICAL WORKS (4.x)
    { wbs: '4.1', name: 'Electrical Shop Drawings', disc: 'Elec', start: '2026-06-10', finish: '2026-06-20', dur: 10, critical: 0, float: 5, remarks: null },
    { wbs: '4.2', name: 'Conduit & Cable Tray Installation', disc: 'Elec', start: '2026-06-21', finish: '2026-07-05', dur: 14, critical: 1, float: 0, remarks: 'Critical Path' },
    { wbs: '4.3', name: 'Cable Pulling & Terminations', disc: 'Elec', start: '2026-07-06', finish: '2026-07-12', dur: 6, critical: 1, float: 0, remarks: 'Critical Path' },
    { wbs: '4.4', name: 'DB/MDB Installation & Testing', disc: 'Elec', start: '2026-07-10', finish: '2026-07-16', dur: 6, critical: 1, float: 0, remarks: 'Critical Path' },
    { wbs: '4.5', name: 'Earthing & Bonding Works', disc: 'Elec', start: '2026-07-06', finish: '2026-07-10', dur: 4, critical: 0, float: 2, remarks: null },
    { wbs: '4.6', name: 'Emergency / Exit Lighting Installation', disc: 'Elec', start: '2026-07-10', finish: '2026-07-13', dur: 3, critical: 0, float: 3, remarks: null },
    { wbs: '4.7', name: 'Fire Alarm System Installation', disc: 'Elec', start: '2026-06-21', finish: '2026-07-08', dur: 17, critical: 0, float: 5, remarks: null },
    { wbs: '4.8', name: 'CCTV & Access Control Rough-in', disc: 'Elec', start: '2026-06-21', finish: '2026-07-05', dur: 14, critical: 0, float: 5, remarks: null },

    // COMMISSIONING & HANDOVER (5.x)
    { wbs: '5.1', name: 'Systems Testing & Commissioning', disc: 'All', start: '2026-07-12', finish: '2026-07-14', dur: 2, critical: 1, float: 0, remarks: 'Critical Path' },
    { wbs: '5.2', name: 'Snag List Identification & Rectification', disc: 'All', start: '2026-07-14', finish: '2026-07-15', dur: 1, critical: 1, float: 0, remarks: 'Critical Path' },
    { wbs: '5.3', name: 'Final Inspection & Handover', disc: 'All', start: '2026-07-15', finish: '2026-07-16', dur: 1, critical: 1, float: 0, remarks: 'Critical Path' },
  ];

  await new Promise<void>((resolve, reject) => {
    const dbInstance = getDb();
    dbInstance.serialize(async () => {
        try {
            dbInstance.run('BEGIN TRANSACTION');
            let order = 1;
            const stmt = dbInstance.prepare(`
                INSERT INTO baseline_activities 
                (project_id, discipline_id, wbs, name, planned_start, planned_finish, planned_duration, is_critical, float_days, sort_order, remarks)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);
            
            for (const a of activities) {
                const disciplineId = discIds[a.disc];
                if (!disciplineId) {
                    console.error(`  ✗ Unknown discipline code: ${a.disc} for WBS ${a.wbs}`);
                    continue;
                }
                stmt.run(
                    projectId, disciplineId, a.wbs, a.name,
                    a.start, a.finish, a.dur,
                    a.critical, a.float, order++, a.remarks
                );
            }
            stmt.finalize();
            dbInstance.run('COMMIT', () => resolve());
        } catch(e) {
            dbInstance.run('ROLLBACK');
            reject(e);
        }
    });
  });

  console.log(`  ✓ ${activities.length} baseline activities created`);

  // =============================================
  // 4. Compute & update discipline weights (by total planned duration)
  // =============================================
  
  const discWeights = await dbAll<{ id: number; code: string; total_duration: number }>(`
    SELECT d.id, d.code, COALESCE(SUM(ba.planned_duration), 0) as total_duration
    FROM disciplines d
    LEFT JOIN baseline_activities ba ON ba.discipline_id = d.id
    WHERE d.project_id = ?
    GROUP BY d.id
  `, [projectId]);

  const grandTotal = discWeights.reduce((sum, d) => sum + d.total_duration, 0);
  
  for (const d of discWeights) {
    const weight = grandTotal > 0 ? (d.total_duration / grandTotal) * 100 : 0;
    await dbRun('UPDATE disciplines SET weight = ? WHERE id = ?', [Math.round(weight * 100) / 100, d.id]);
    console.log(`  ✓ ${d.code}: weight = ${(weight).toFixed(1)}% (${d.total_duration} days)`);
  }

  // =============================================
  // 5. Create default admin user
  // =============================================
  const hashedPassword = await bcrypt.hash('admin@123', 10);
  await dbRun(`
    INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)
  `, ['Admin', 'admin', hashedPassword, 'admin']);
  console.log('  ✓ Default admin user created (admin / admin@123)');

  // =============================================
  // 6. Create initial published report (Week 1 — 09-Jun-2026)
  // =============================================
  const reportResult = await dbRun(`
    INSERT INTO reports (project_id, created_by, period_label, report_date, period_number, status, reporting_cutoff, published_at, published_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id
  `, [projectId, 1, 'Week 1', '2026-06-09', 1, 'published', '2026-06-09', '2026-06-09T00:00:00Z', 1]);
  const reportId = reportResult.lastID;

  // Activity progress data from existing dashboard (09-Jun-2026 report)
  const progressData: Record<string, { pct: number; status: string }> = {
    '1.1': { pct: 40, status: 'In Progress' },
    '1.2': { pct: 50, status: 'In Progress' },
    '1.3': { pct: 90, status: 'In Progress' },
    '1.4': { pct: 90, status: 'In Progress' },
    '1.5': { pct: 85, status: 'In Progress' },
    '1.6': { pct: 0, status: 'Not Started' },
    '2.1': { pct: 50, status: 'In Progress' },
    '2.2': { pct: 20, status: 'In Progress' },
    '2.3': { pct: 0, status: 'Not Started' },
    '2.4': { pct: 0, status: 'Not Started' },
    '2.5': { pct: 0, status: 'Not Started' },
    '2.6': { pct: 0, status: 'Not Started' },
    '2.7': { pct: 0, status: 'Not Started' },
    '2.8': { pct: 0, status: 'Not Started' },
    '2.9': { pct: 0, status: 'Not Started' },
    '2.10': { pct: 0, status: 'Not Started' },
    '2.11': { pct: 0, status: 'Not Started' },
    '2.12': { pct: 0, status: 'Not Started' },
    '2.13': { pct: 0, status: 'Not Started' },
    '2.14': { pct: 100, status: 'Complete' },
    '2.15': { pct: 0, status: 'Not Started' },
    '2.16': { pct: 0, status: 'Not Started' },
    '2.17': { pct: 0, status: 'Not Started' },
    '2.18': { pct: 0, status: 'Not Started' },
    '2.19': { pct: 0, status: 'Not Started' },
    '2.20': { pct: 0, status: 'Not Started' },
    '2.21': { pct: 0, status: 'Not Started' },
    '2.22': { pct: 0, status: 'Not Started' },
    '3.1': { pct: 17, status: 'In Progress' },
    '3.2': { pct: 0, status: 'Not Started' },
    '3.3': { pct: 0, status: 'Not Started' },
    '3.4': { pct: 65, status: 'In Progress' },
    '3.5': { pct: 100, status: 'Complete' },
    '3.6': { pct: 60, status: 'In Progress' },
    '3.7': { pct: 65, status: 'In Progress' },
    '3.8': { pct: 0, status: 'Not Started' },
    '3.9': { pct: 0, status: 'Not Started' },
    '4.1': { pct: 60, status: 'In Progress' },
    '4.2': { pct: 0, status: 'Not Started' },
    '4.3': { pct: 0, status: 'Not Started' },
    '4.4': { pct: 0, status: 'Not Started' },
    '4.5': { pct: 0, status: 'Not Started' },
    '4.6': { pct: 0, status: 'Not Started' },
    '4.7': { pct: 0, status: 'Not Started' },
    '4.8': { pct: 0, status: 'Not Started' },
    '5.1': { pct: 0, status: 'Not Started' },
    '5.2': { pct: 0, status: 'Not Started' },
    '5.3': { pct: 0, status: 'Not Started' },
  };

  const baselineActivities = await dbAll<{
    id: number; wbs: string; name: string; discipline_id: number;
    planned_start: string; planned_finish: string; planned_duration: number;
    is_critical: number; float_days: number;
  }>('SELECT * FROM baseline_activities WHERE project_id = ? ORDER BY sort_order', [projectId]);

  // Get discipline codes
  const discLookup = await dbAll<{ id: number; code: string }>('SELECT id, code FROM disciplines WHERE project_id = ?', [projectId]);
  const discIdToCode: Record<number, string> = {};
  for (const d of discLookup) discIdToCode[d.id] = d.code;

  await new Promise<void>((resolve, reject) => {
    const dbInstance = getDb();
    dbInstance.serialize(async () => {
        try {
            dbInstance.run('BEGIN TRANSACTION');
            const stmt = dbInstance.prepare(`
                INSERT INTO report_activities 
                (report_id, baseline_activity_id, wbs, activity_name, discipline_code,
                planned_start, planned_finish, planned_duration, progress_pct, status, is_critical, float_days, remarks)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);

            for (const ba of baselineActivities) {
                const progress = progressData[ba.wbs] || { pct: 0, status: 'Not Started' };
                const discCode = discIdToCode[ba.discipline_id] || 'Unknown';
                stmt.run(
                    reportId, ba.id, ba.wbs, ba.name, discCode,
                    ba.planned_start, ba.planned_finish, ba.planned_duration,
                    progress.pct, progress.status, ba.is_critical, ba.float_days, null
                );
            }
            stmt.finalize();
            dbInstance.run('COMMIT', () => resolve());
        } catch(e) {
            dbInstance.run('ROLLBACK');
            reject(e);
        }
    });
  });

  console.log(`  ✓ Week 1 report created with ${baselineActivities.length} activity records`);

  console.log('\n✓ Database seeding complete.');
  closeDb();
}

seed().catch(console.error);
