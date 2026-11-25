// The Commands screen's action icons: thin strokes on a 24 grid, like the Map navbar's.
import Svg, { Circle, Path, Rect } from 'react-native-svg';

export type CommandIconName =
  | 'pick'
  | 'place'
  | 'give'
  | 'receive'
  | 'aside'
  | 'sort'
  | 'wave'
  | 'come'
  | 'follow'
  | 'goto'
  | 'dock'
  | 'fetch'
  | 'carry'
  | 'drive'
  | 'turn'
  | 'look'
  | 'say'
  | 'ask'
  | 'sing'
  | 'volume'
  | 'type'
  | 'pause'
  | 'resume'
  | 'stop'
  | 'release';

export function CommandIcon({ name, size, color }: { name: CommandIconName; size: number; color: string }) {
  const p = { stroke: color, strokeWidth: 1.7, fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
  const cup = <Path d="M7 11h10l-1.2 8.5H8.2z" {...p} />;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {name === 'pick' && (
        <>
          {cup}
          <Path d="M12 8V2.5M9.5 5L12 2.5 14.5 5" {...p} />
        </>
      )}
      {name === 'place' && (
        <>
          <Path d="M7 8h10l-1.2 8.5H8.2z" {...p} />
          <Path d="M3 20.5h18" {...p} />
        </>
      )}
      {name === 'give' && <Path d="M3 12h12M11 8l4 4-4 4M19 5v14" {...p} />}
      {name === 'receive' && <Path d="M21 12H9M13 8l-4 4 4 4M5 5v14" {...p} />}
      {name === 'aside' && (
        <>
          <Path d="M3 13h7l-1 7H4z" {...p} />
          <Path d="M13 9h8M18 6l3 3-3 3" {...p} />
        </>
      )}
      {name === 'sort' && (
        <>
          <Circle cx={7} cy={5} r={2.2} {...p} />
          <Circle cx={17} cy={5} r={2.2} {...p} />
          <Path d="M7 9v3.5M17 9v3.5M3 14.5V20h8v-5.5M13 14.5V20h8v-5.5" {...p} />
        </>
      )}
      {name === 'wave' && (
        <Path
          d="M8.5 13V6.5a1.5 1.5 0 0 1 3 0V11M11.5 11V4.5a1.5 1.5 0 0 1 3 0V11M14.5 11V6.5a1.5 1.5 0 0 1 3 0V14a6 6 0 0 1-6 6h-.8a5 5 0 0 1-4.3-2.5L4.2 13a1.5 1.5 0 0 1 2.6-1.5L8.5 13M19.5 3.5l1.5-1M20.5 7H22"
          {...p}
        />
      )}
      {(name === 'come' || name === 'follow') && (
        <>
          <Circle cx={18} cy={5.5} r={2} {...p} />
          <Path d="M18 9v6M15.5 21l2.5-6 2.5 6" {...p} />
          {name === 'come' ? <Path d="M2.5 12h9M8.5 9l3 3-3 3" {...p} /> : <Path d="M3 19l3-3M8 14l3-3M13 9l1-1" {...p} />}
        </>
      )}
      {name === 'goto' && (
        <>
          <Path d="M12 21s-6-5.5-6-11a6 6 0 0 1 12 0c0 5.5-6 11-6 11z" {...p} />
          <Circle cx={12} cy={10} r={2} {...p} />
        </>
      )}
      {name === 'dock' && <Path d="M13 2.5L5.5 13H11l-1 8.5 7.5-10.5H12z" {...p} />}
      {name === 'fetch' && (
        <>
          <Path d="M17 14s-4-3.7-4-7.3a4 4 0 0 1 8 0c0 3.6-4 7.3-4 7.3z" {...p} />
          <Path d="M10 18H3M6 15l-3 3 3 3" {...p} />
        </>
      )}
      {name === 'carry' && (
        <>
          <Rect x={2.5} y={8} width={10} height={9} rx={1.5} {...p} />
          <Path d="M14.5 12.5h7M18.5 9.5l3 3-3 3" {...p} />
        </>
      )}
      {name === 'drive' && <Path d="M12 21V4M6.5 9.5L12 4l5.5 5.5" {...p} />}
      {name === 'turn' && <Path d="M20 12a8 8 0 1 1-2.4-5.7M20 3.5v5h-5" {...p} />}
      {name === 'look' && (
        <>
          <Path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z" {...p} />
          <Circle cx={12} cy={12} r={2.8} {...p} />
        </>
      )}
      {(name === 'say' || name === 'ask') && (
        <>
          <Path d="M4 4.5h16v11H10l-6 4.5z" {...p} />
          {name === 'ask' && <Path d="M10 8.2a2 2 0 1 1 2.8 1.8c-.6.3-.8.7-.8 1.3M12 13.3v.1" {...p} />}
        </>
      )}
      {name === 'sing' && (
        <>
          <Path d="M9 18V5.5l11-2V16" {...p} />
          <Circle cx={6.5} cy={18} r={2.5} {...p} />
          <Circle cx={17.5} cy={16} r={2.5} {...p} />
        </>
      )}
      {name === 'volume' && <Path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4zM15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" {...p} />}
      {name === 'type' && (
        <>
          <Rect x={2.5} y={5} width={19} height={14} rx={2} {...p} />
          <Path d="M6.5 10l3 2-3 2M12 15h5" {...p} />
        </>
      )}
      {name === 'pause' && <Path d="M9 5v14M15 5v14" {...p} />}
      {name === 'resume' && <Path d="M7.5 4.5v15L19 12z" {...p} />}
      {name === 'stop' && <Rect x={5.5} y={5.5} width={13} height={13} rx={1.5} {...p} />}
      {name === 'release' && <Path d="M8 3v6l-4 7M16 3v6l4 7M8 9h8M12 14v7M9.5 18.5L12 21l2.5-2.5" {...p} />}
    </Svg>
  );
}
