export type SchoolId = 'electro' | 'pyro' | 'kinetic' | 'necro' | 'mech' | 'glitch';

export interface School {
  name: string;
  elem: number;
  color: number;
  css: string;
  set2: string;
  set4: string;
}

// индекс стихии = позиция в этом списке
export const SCHOOL_ORDER: SchoolId[] = ['electro', 'pyro', 'kinetic', 'necro', 'mech', 'glitch'];

export const SCHOOLS: Record<SchoolId, School> = {
  electro: {
    name: 'Электро',
    elem: 0,
    color: 0x3ef0ff,
    css: '#3ef0ff',
    set2: 'Шок длится вдвое дольше, электроурон +15%',
    set4: 'Каждое 10-е электропопадание вызывает удар с орбиты',
  },
  pyro: {
    name: 'Пиро',
    elem: 1,
    color: 0xff7a2d,
    css: '#ff7a2d',
    set2: 'Горение наносит на 50% больше урона',
    set4: 'Горящие враги взрываются при смерти',
  },
  kinetic: {
    name: 'Кинетика',
    elem: 2,
    color: 0x9ad8ff,
    css: '#9ad8ff',
    set2: 'Замороженные получают +50% урона',
    set4: 'Чёрные дыры замораживают всё, что затянули',
  },
  necro: {
    name: 'Некрокод',
    elem: 3,
    color: 0x7dff6a,
    css: '#7dff6a',
    set2: 'Миньоны заражают тех, кого бьют',
    set4: '+2 к лимиту миньонов, миньоны взрываются при смерти',
  },
  mech: {
    name: 'Механика',
    elem: 4,
    color: 0xffc94a,
    css: '#ffc94a',
    set2: 'Дроны и турели получают твой шанс крита',
    set4: 'Во время трансформации турели стреляют вдвое чаще',
  },
  glitch: {
    name: 'Глитч',
    elem: 5,
    color: 0xff4fd8,
    css: '#ff4fd8',
    set2: 'Двойники и приманки живут на 50% дольше',
    set4: 'Каждый рывок оставляет взрывную приманку',
  },
};
