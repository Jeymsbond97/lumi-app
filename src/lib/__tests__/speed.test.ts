import {
  ARM_SPEED_FALLBACK,
  BODY_SPEED_RANGE,
  clampPercent,
  fractionOf,
  jogSpeedOf,
  stepPercent,
  toArmSpeed,
  toStoredPercent,
  valueAt,
} from '../speed';

const ARM = { min: 10, max: 150 };

describe('clampPercent', () => {
  it('snaps to whole percents inside the range', () => {
    expect(clampPercent(42.4, ARM)).toBe(42);
    expect(clampPercent(42.6, ARM)).toBe(43);
    expect(clampPercent(3, ARM)).toBe(10);
    expect(clampPercent(200, ARM)).toBe(150);
    expect(clampPercent(Number.NaN, ARM)).toBe(10);
  });
});

describe('position and value', () => {
  it('maps the track ends to the range ends', () => {
    expect(valueAt(0, 200, ARM)).toBe(10);
    expect(valueAt(200, 200, ARM)).toBe(150);
    expect(valueAt(100, 200, ARM)).toBe(80);
  });

  it('keeps a finger past either end at the end', () => {
    expect(valueAt(-30, 200, ARM)).toBe(10);
    expect(valueAt(260, 200, ARM)).toBe(150);
  });

  it('gives the minimum before the track has a width', () => {
    expect(valueAt(50, 0, ARM)).toBe(10);
  });

  it('places a value where the finger would set it', () => {
    expect(fractionOf(10, ARM)).toBe(0);
    expect(fractionOf(150, ARM)).toBe(1);
    expect(fractionOf(80, ARM)).toBe(0.5);
    for (const v of [10, 37, 80, 123, 150]) expect(valueAt(fractionOf(v, ARM) * 300, 300, ARM)).toBe(v);
  });

  it('does not divide by an empty range', () => {
    expect(fractionOf(50, { min: 50, max: 50 })).toBe(0);
  });
});

describe('stepPercent', () => {
  it('moves 5 % and stops at the ends', () => {
    expect(stepPercent(50, 5, BODY_SPEED_RANGE)).toBe(55);
    expect(stepPercent(50, -5, BODY_SPEED_RANGE)).toBe(45);
    expect(stepPercent(98, 5, BODY_SPEED_RANGE)).toBe(100);
    expect(stepPercent(7, -5, BODY_SPEED_RANGE)).toBe(5);
  });
});

describe('jogSpeedOf', () => {
  it('sends the body percent as a share of the top speed, 0.05 to 1', () => {
    expect(jogSpeedOf(50)).toBe(0.5);
    expect(jogSpeedOf(5)).toBe(0.05);
    expect(jogSpeedOf(100)).toBe(1);
    expect(jogSpeedOf(1)).toBe(0.05);
    expect(jogSpeedOf(150)).toBe(1);
  });
});

describe('toArmSpeed', () => {
  it('reads the robot reply', () => {
    expect(toArmSpeed({ percent: 80, min: 10, max: 150 })).toEqual({ percent: 80, min: 10, max: 150 });
  });

  it('falls back to 10 to 150 without a range', () => {
    expect(toArmSpeed({ percent: 100 })).toEqual({ percent: 100, ...ARM_SPEED_FALLBACK });
    expect(toArmSpeed({ percent: 100, min: 50, max: 20 })).toEqual({ percent: 100, ...ARM_SPEED_FALLBACK });
  });

  it('keeps the percent inside the range', () => {
    expect(toArmSpeed({ percent: 300, min: 10, max: 150 })?.percent).toBe(150);
  });

  it('is null without a percent', () => {
    expect(toArmSpeed(null)).toBeNull();
    expect(toArmSpeed({ detail: 'Not Found' })).toBeNull();
    expect(toArmSpeed({ percent: '80' })).toBeNull();
  });
});

describe('toStoredPercent', () => {
  it('reads a kept body speed', () => {
    expect(toStoredPercent('35', BODY_SPEED_RANGE)).toBe(35);
    expect(toStoredPercent('300', BODY_SPEED_RANGE)).toBe(100);
  });

  it('ignores nothing or rubbish', () => {
    expect(toStoredPercent(null, BODY_SPEED_RANGE)).toBeNull();
    expect(toStoredPercent('', BODY_SPEED_RANGE)).toBeNull();
    expect(toStoredPercent('fast', BODY_SPEED_RANGE)).toBeNull();
  });
});
