import { ARC, BOLT, STRIKE, TESLA } from './electro';
import { DECOY, MIRROR, STASIS, TRAIL } from './glitch';
import { BLADE, CRYO, GRAV, RICOCHET } from './kinetic';
import { MECHSUIT, ORBIT, RAILGUN, TURRET } from './mech';
import { LEECH, REANIMATE, SWARM, VIRUS } from './necro';
import { FIREWALL, LASER, METEOR, PYRE } from './pyro';
import type { WeaponDef } from './types';

// 6 школ × 4 оружия
export const ARSENAL: WeaponDef[] = [
  BOLT, ARC, STRIKE, TESLA,
  PYRE, LASER, FIREWALL, METEOR,
  CRYO, GRAV, BLADE, RICOCHET,
  VIRUS, SWARM, REANIMATE, LEECH,
  ORBIT, TURRET, MECHSUIT, RAILGUN,
  MIRROR, TRAIL, DECOY, STASIS,
];

export const byId = (id: string) => ARSENAL.find((w) => w.id === id);
