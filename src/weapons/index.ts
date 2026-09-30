import { ARC, BOLT, STRIKE, TESLA } from './electro';
import { ORBIT } from './mech';
import { FIREWALL, LASER, METEOR, PYRE } from './pyro';
import type { WeaponDef } from './types';

// доступные в игре оружия; остальные школы добавляются сюда по мере готовности
export const ARSENAL: WeaponDef[] = [BOLT, ARC, STRIKE, TESLA, PYRE, LASER, FIREWALL, METEOR, ORBIT];
export const START_WEAPON = BOLT;
