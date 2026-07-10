export interface Wareki {
	era: string;
	year: number;
}

/** 新しい順。start は各元号の開始日（グレゴリオ暦） */
const ERAS: readonly { name: string; start: string }[] = [
	{ name: '令和', start: '2019-05-01' },
	{ name: '平成', start: '1989-01-08' },
	{ name: '昭和', start: '1926-12-25' },
	{ name: '大正', start: '1912-07-30' },
	{ name: '明治', start: '1868-01-25' },
] as const;

/** ISO日付を和暦に変換する。明治より前（1868-01-24以前）は null */
export function toWareki(isoDate: string): Wareki | null {
	for (const era of ERAS) {
		if (isoDate >= era.start) {
			return { era: era.name, year: Number(isoDate.slice(0, 4)) - Number(era.start.slice(0, 4)) + 1 };
		}
	}
	return null;
}

/** 「昭和39年」「令和元年」の形式。明治より前は null */
export function formatWareki(isoDate: string): string | null {
	const w = toWareki(isoDate);
	if (w === null) return null;
	return `${w.era}${w.year === 1 ? '元' : w.year}年`;
}
