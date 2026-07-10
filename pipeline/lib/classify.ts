import type { Category, Region } from '../../src/lib/types.ts';

/** 先勝ちの優先順位付きカテゴリルール */
const CATEGORY_RULES: readonly [Category, RegExp][] = [
	[
		'disaster',
		/地震|震災|噴火|津波|台風|豪雨|洪水|土砂|大火|火災|焼失|墜落|沈没|座礁|脱線|衝突|爆発事故|炭鉱事故|遭難|パンデミック|感染症?拡大|集団感染|疫病|コレラ|ペスト|スペインかぜ|インフルエンザ|飢饉/,
	],
	[
		'war',
		/戦争|開戦|終戦|停戦|休戦|侵攻|侵略|空爆|爆撃|原爆|原子爆弾|徴兵|クーデター|内戦|紛争|戦闘|事変|出兵|参戦|派兵|宣戦|降伏|玉音|テロ|暗殺|虐殺|捕虜|戦艦|艦隊|進駐|占領|革命/,
	],
	[
		'sports',
		/オリンピック|五輪|パラリンピック|ワールドカップ|世界選手権|選手権|プロ野球|甲子園|Jリーグ|大相撲|横綱|金メダル|国体|マラソン|ボクシング|レスリング|野球|サッカー|テニス|ゴルフ|グランプリ/,
	],
	[
		'science',
		/打ち上げ|人工衛星|宇宙船|宇宙飛行|ロケット|月面|探査機|ノーベル[^。]*賞|発明|発見|観測|開発に成功|合成に成功|初めて合成|世界初の実験|原子力|原発|原子炉|素粒子|コンピュータ|インターネット|クローン|ゲノム|遺伝子|ワクチン|iPS細胞|新元素|飛行に成功|初飛行|開通|鉄道が開業|地下鉄|電化|ダム完成/,
	],
	[
		'politics',
		/内閣|首相|大統領|総理|総選挙|選挙|投票|議会|国会|法案|法律|公布|施行|憲法|条約|協定|調印|批准|国交|外交|独立|建国|成立|共和国|王国|帝国|政権|即位|退位|譲位|天皇|皇太子|大臣|知事|市長|政党|党首|サミット|首脳会談|国際連合|国連加盟|廃藩置県|藩|勅令|詔書|布告/,
	],
	[
		'economy',
		/銀行|株式|株価|証券|取引所|恐慌|金融危機|不況|バブル|倒産|経営破綻|破産|合併|買収|上場|円高|円安|平価|金本位|関税|貿易|国債|通貨|新紙幣|デノミ|インフレ|デフレ|日銀|財閥|国有化|民営化|会社(が)?設立|操業開始|創業|石油危機|オイルショック/,
	],
	[
		'culture',
		/映画|音楽|アルバム|レコード|コンサート|文学|小説|芸術|美術|展覧会|漫画|アニメ|ドラマ|放送開始|テレビ放送|ラジオ放送|万国博覧会|万博|博覧会|世界遺産|発売|刊行|創刊|出版|演劇|歌舞伎|上演|公開|開館|開園|流行語|ファッション/,
	],
];

const JAPAN_RE =
	/日本|東京|大阪|京都|名古屋|横浜|神戸|福岡|札幌|仙台|広島|長崎|沖縄|北海道|本州|九州|四国|江戸|幕府|廃藩|府県|[一-龠]{1,4}県|内閣|帝国議会|国会|首相|総理|天皇|皇居|皇太子|皇室|新幹線|国鉄|JR|NHK|日銀|甲子園|大相撲|日米|日露|日清|日韓|日中|日英/;

const WORLD_RE =
	/アメリカ|米国|米軍|米大統領|訪米|イギリス|英国|フランス|ドイツ|プロイセン|イタリア|スペイン|ポルトガル|オランダ|ベルギー|スイス|デンマーク|スウェーデン|ノルウェー|フィンランド|アイルランド|アイスランド|チェコ|スロバキア|ルーマニア|ブルガリア|セルビア|ユーゴ|クロアチア|ロシア|ソ連|ソビエト|中国|中華|清国|清朝|韓国|朝鮮|台湾|インド|パキスタン|バングラデシュ|スリランカ|ネパール|ベトナム|フィリピン|インドネシア|マレーシア|シンガポール|ミャンマー|ビルマ|カンボジア|ラオス|モンゴル|タイ|アフガニスタン|イラン|イラク|イスラエル|パレスチナ|サウジアラビア|シリア|レバノン|ヨルダン|クウェート|エジプト|リビア|チュニジア|アルジェリア|モロッコ|エチオピア|ケニア|ナイジェリア|ガーナ|スーダン|トルコ|ギリシャ|オーストリア|ハンガリー|ポーランド|ウクライナ|ブラジル|アルゼンチン|チリ|ペルー|コロンビア|ベネズエラ|メキシコ|キューバ|カナダ|オーストラリア|ニュージーランド|南アフリカ|ヨーロッパ|欧州|アフリカ|中東|中南米|バチカン|ローマ教皇|国際連合|国際連盟|国連|NATO|EU\b|EC\b|WHO|IMF|オリンピック委員会|パリ|ロンドン|ニューヨーク|ワシントン|ベルリン|モスクワ|北京|上海|ソウル|ローマ|ウィーン|ジュネー[ヴブ]|香港|世界初|世界で/;

/** カタカナ4文字以上の連なり（外国人名・外来組織名のシグナル） */
const KATAKANA_RUN_RE = /[ァ-ヴー]{4,}/;

export function classifyCategory(text: string): Category {
	for (const [cat, re] of CATEGORY_RULES) {
		if (re.test(text)) return cat;
	}
	return 'society';
}

export function classifyRegion(text: string): Region {
	const j = JAPAN_RE.test(text);
	const w = WORLD_RE.test(text);
	if (j && w) return 'both';
	if (j) return 'japan';
	if (w) return 'world';
	return KATAKANA_RUN_RE.test(text) ? 'world' : 'japan';
}

export interface Classification {
	category: Category;
	region: Region;
}

export type ClassifySidecar = Record<string, Partial<Classification>>;

/**
 * ルールベース分類に、本文タグ由来の地域ヒント（あれば優先）と
 * サイドカー（人手/Claude一括分類の確定値・最優先）を適用する
 */
export function classify(
	id: string,
	text: string,
	sidecar: ClassifySidecar = {},
	regionHint?: Region,
): Classification {
	const base: Classification = {
		category: classifyCategory(text),
		region: regionHint ?? classifyRegion(text),
	};
	const over = sidecar[id];
	if (!over) return base;
	return { category: over.category ?? base.category, region: over.region ?? base.region };
}
