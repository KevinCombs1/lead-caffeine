const VALID_US_AREA_CODES = new Set([
  201,202,203,204,205,206,207,208,209,210,212,213,214,215,216,217,218,219,
  220,223,224,225,226,228,229,231,234,236,239,240,248,249,250,251,252,253,
  254,256,260,262,267,269,270,272,274,276,278,281,283,289,
  301,302,303,304,305,306,307,308,309,310,312,313,314,315,316,317,318,319,
  320,321,323,325,326,327,330,331,332,334,336,337,338,339,340,341,346,347,
  351,352,360,361,364,365,369,380,385,386,
  401,402,403,404,405,406,407,408,409,410,412,413,414,415,416,417,418,419,
  423,424,425,428,430,431,432,434,435,436,438,440,441,442,443,445,447,448,450,458,
  463,464,469,470,472,473,475,478,479,480,484,
  500,501,502,503,504,505,506,507,508,509,510,512,513,514,515,516,517,518,519,
  520,530,531,532,534,539,540,541,548,551,557,559,561,562,563,564,567,570,
  571,572,573,574,575,576,579,580,581,582,585,586,587,
  601,602,603,604,605,606,607,608,609,610,612,613,614,615,616,617,618,619,
  620,623,624,625,626,627,628,629,630,631,636,639,640,641,646,647,649,650,
  651,656,657,658,659,660,661,662,667,669,670,671,672,678,679,680,681,682,683,684,689,
  701,702,703,704,705,706,707,708,709,710,712,713,714,715,716,717,718,719,
  720,721,724,725,726,727,731,732,734,737,740,743,747,754,757,760,762,763,
  765,769,770,771,772,773,774,775,778,779,780,781,782,785,786,787,
  801,802,803,804,805,806,807,808,809,810,812,813,814,815,816,817,818,819,
  820,825,826,828,830,831,832,835,838,839,840,843,845,847,848,850,854,856,
  857,858,859,860,861,862,863,864,865,867,868,869,870,872,873,876,878,
  901,902,903,904,905,906,907,908,909,910,912,913,914,915,916,917,918,919,
  920,925,928,929,930,931,934,935,936,937,938,939,940,941,943,945,947,948,
  949,951,952,954,956,957,959,970,971,972,973,975,978,979,980,984,985,986,989
]);

const AREA_CODE_STATE_MAP: Record<number, string[]> = {
  201:["NJ"],202:["DC"],203:["CT"],205:["AL"],206:["WA"],207:["ME"],208:["ID"],
  209:["CA"],210:["TX"],212:["NY"],213:["CA"],214:["TX"],215:["PA"],216:["OH"],
  217:["IL"],218:["MN"],219:["IN"],220:["OH"],223:["PA"],224:["IL"],225:["LA"],
  228:["MS"],229:["GA"],231:["MI"],234:["OH"],239:["FL"],240:["MD"],248:["MI"],
  251:["AL"],252:["NC"],253:["WA"],254:["TX"],256:["AL"],260:["IN"],262:["WI"],
  267:["PA"],269:["MI"],270:["KY"],272:["PA"],276:["VA"],281:["TX"],
  301:["MD"],302:["DE"],303:["CO"],304:["WV"],305:["FL"],307:["WY"],308:["NE"],
  309:["IL"],310:["CA"],312:["IL"],313:["MI"],314:["MO"],315:["NY"],316:["KS"],
  317:["IN"],318:["LA"],319:["IA"],320:["MN"],321:["FL"],323:["CA"],325:["TX"],
  326:["OH"],327:["AR"],330:["OH"],331:["IL"],332:["NY"],334:["AL"],336:["NC"],
  337:["LA"],339:["MA"],340:["VI"],346:["TX"],347:["NY"],351:["MA"],352:["FL"],
  360:["WA"],361:["TX"],364:["KY"],380:["OH"],385:["UT"],386:["FL"],
  401:["RI"],402:["NE"],403:["AB"],404:["GA"],405:["OK"],406:["MT"],407:["FL"],
  408:["CA"],409:["TX"],410:["MD"],412:["PA"],413:["MA"],414:["WI"],415:["CA"],
  417:["MO"],418:["QC"],419:["OH"],423:["TN"],424:["CA"],425:["WA"],430:["TX"],
  432:["TX"],434:["VA"],435:["UT"],440:["OH"],442:["CA"],443:["MD"],445:["PA"],
  458:["OR"],463:["IN"],464:["IL"],469:["TX"],470:["GA"],475:["CT"],478:["GA"],
  479:["AR"],480:["AZ"],484:["PA"],
  501:["AR"],502:["KY"],503:["OR"],504:["LA"],505:["NM"],507:["MN"],508:["MA"],
  509:["WA"],510:["CA"],512:["TX"],513:["OH"],515:["IA"],516:["NY"],517:["MI"],
  518:["NY"],519:["ON"],520:["AZ"],530:["CA"],531:["NE"],534:["WI"],539:["OK"],
  540:["VA"],541:["OR"],551:["NJ"],559:["CA"],561:["FL"],562:["CA"],563:["IA"],
  564:["WA"],567:["OH"],570:["PA"],571:["VA"],573:["MO"],574:["IN"],575:["NM"],
  580:["OK"],585:["NY"],586:["MI"],
  601:["MS"],602:["AZ"],603:["NH"],605:["SD"],606:["KY"],607:["NY"],608:["WI"],
  609:["NJ"],610:["PA"],612:["MN"],613:["ON"],614:["OH"],615:["TN"],616:["MI"],
  617:["MA"],618:["IL"],619:["CA"],620:["KS"],623:["AZ"],626:["CA"],628:["CA"],
  629:["TN"],630:["IL"],631:["NY"],636:["MO"],641:["IA"],646:["NY"],650:["CA"],
  651:["MN"],657:["CA"],659:["AL"],660:["MO"],661:["CA"],662:["MS"],667:["MD"],
  669:["CA"],678:["GA"],680:["NY"],681:["WV"],682:["TX"],689:["FL"],
  701:["ND"],702:["NV"],703:["VA"],704:["NC"],706:["GA"],707:["CA"],708:["IL"],
  710:["US"],712:["IA"],713:["TX"],714:["CA"],715:["WI"],716:["NY"],717:["PA"],
  718:["NY"],719:["CO"],720:["CO"],724:["PA"],725:["NV"],726:["TX"],727:["FL"],
  731:["TN"],732:["NJ"],734:["MI"],737:["TX"],740:["OH"],743:["NC"],747:["CA"],
  754:["FL"],757:["VA"],760:["CA"],762:["GA"],763:["MN"],765:["IN"],769:["MS"],
  770:["GA"],771:["DC"],772:["FL"],773:["IL"],774:["MA"],775:["NV"],779:["IL"],
  781:["MA"],785:["KS"],786:["FL"],787:["PR"],
  801:["UT"],802:["VT"],803:["SC"],804:["VA"],805:["CA"],806:["TX"],808:["HI"],
  810:["MI"],812:["IN"],813:["FL"],814:["PA"],815:["IL"],816:["MO"],817:["TX"],
  818:["CA"],820:["CA"],828:["NC"],830:["TX"],831:["CA"],832:["TX"],838:["NY"],
  843:["SC"],845:["NY"],847:["IL"],848:["NJ"],850:["FL"],854:["SC"],856:["NJ"],
  857:["MA"],858:["CA"],859:["KY"],860:["CT"],862:["NJ"],863:["FL"],864:["SC"],
  865:["TN"],870:["AR"],872:["IL"],878:["PA"],
  901:["TN"],903:["TX"],904:["FL"],906:["MI"],907:["AK"],908:["NJ"],909:["CA"],
  910:["NC"],912:["GA"],913:["KS"],914:["NY"],915:["TX"],916:["CA"],917:["NY"],
  918:["OK"],919:["NC"],920:["WI"],925:["CA"],928:["AZ"],929:["NY"],930:["IN"],
  931:["TN"],934:["NY"],935:["CA"],936:["TX"],937:["OH"],938:["AL"],939:["PR"],
  940:["TX"],941:["FL"],943:["GA"],947:["MI"],948:["VA"],949:["CA"],951:["CA"],
  952:["MN"],954:["FL"],956:["TX"],959:["CT"],970:["CO"],971:["OR"],972:["TX"],
  973:["NJ"],978:["MA"],979:["TX"],980:["NC"],984:["NC"],985:["LA"],989:["MI"]
};

const TOLL_FREE_CODES = new Set([800, 833, 844, 855, 866, 877, 888]);
const PREMIUM_CODES = new Set([900, 976]);

function normalizePhone(phone: string): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  if (digits.length === 10) return digits;
  return null;
}

function checkFormat(digits: string): string[] {
  const flags: string[] = [];
  if (digits.length !== 10) {
    flags.push("INVALID_LENGTH");
    return flags;
  }
  if (/^(\d)\1{9}$/.test(digits)) flags.push("ALL_SAME_DIGITS");
  if (digits === "1234567890" || digits === "0123456789") flags.push("SEQUENTIAL_PATTERN");
  if (digits.startsWith("0") || digits.startsWith("1")) flags.push("INVALID_FIRST_DIGIT");
  const exchange = digits.slice(3, 6);
  if (exchange === "555") {
    const suffix = parseInt(digits.slice(6));
    if (suffix >= 100 && suffix <= 199) flags.push("FICTIONAL_555");
    else flags.push("SUSPICIOUS_555");
  }
  if (exchange.startsWith("0") || exchange.startsWith("1")) flags.push("INVALID_EXCHANGE");
  const last4 = digits.slice(6);
  if (last4 === "0000" || last4 === "1111" || last4 === "9999") flags.push("SUSPICIOUS_SUFFIX");
  return flags;
}

function checkAreaCode(digits: string): string[] {
  const flags: string[] = [];
  const ac = parseInt(digits.slice(0, 3));
  if (TOLL_FREE_CODES.has(ac)) {
    flags.push("TOLL_FREE");
    return flags;
  }
  if (PREMIUM_CODES.has(ac)) {
    flags.push("PREMIUM_RATE");
    return flags;
  }
  if (!VALID_US_AREA_CODES.has(ac)) flags.push("UNKNOWN_AREA_CODE");
  return flags;
}

function checkGeoMatch(digits: string, state: string | null): string[] {
  if (!state) return [];
  const flags: string[] = [];
  const ac = parseInt(digits.slice(0, 3));
  if (TOLL_FREE_CODES.has(ac) || PREMIUM_CODES.has(ac)) return [];
  const states = AREA_CODE_STATE_MAP[ac];
  if (states && !states.includes(state)) {
    flags.push("GEO_MISMATCH");
  }
  return flags;
}

export interface PhoneMapData {
  phoneFrequency: Map<string, number>;
  phoneNames: Map<string, Set<string>>;
  phoneCategories: Map<string, Set<string>>;
  sequentialBlocks: Set<string>;
}

export function buildPhoneMap(rows: { phone: string | null; name: string; category: string }[]): PhoneMapData {
  const phoneFrequency = new Map<string, number>();
  const phoneNames = new Map<string, Set<string>>();
  const phoneCategories = new Map<string, Set<string>>();

  for (const row of rows) {
    const digits = normalizePhone(row.phone || "");
    if (!digits) continue;
    phoneFrequency.set(digits, (phoneFrequency.get(digits) || 0) + 1);
    if (!phoneNames.has(digits)) phoneNames.set(digits, new Set());
    phoneNames.get(digits)!.add(row.name.toLowerCase().trim());
    if (!phoneCategories.has(digits)) phoneCategories.set(digits, new Set());
    phoneCategories.get(digits)!.add(row.category);
  }

  const allNumbers = [...phoneFrequency.keys()].map(d => parseInt(d)).filter(n => !isNaN(n)).sort((a, b) => a - b);
  const sequentialBlocks = new Set<string>();
  for (let i = 1; i < allNumbers.length; i++) {
    if (allNumbers[i] - allNumbers[i - 1] <= 5) {
      sequentialBlocks.add(String(allNumbers[i - 1]));
      sequentialBlocks.add(String(allNumbers[i]));
    }
  }

  return { phoneFrequency, phoneNames, phoneCategories, sequentialBlocks };
}

export function authenticatePhone(
  phone: string | null,
  state: string | null,
  phoneMap: PhoneMapData
): { score: number; flags: string[]; valid: boolean } {
  if (!phone) return { score: 0, flags: ["NO_PHONE"], valid: false };

  const digits = normalizePhone(phone);
  if (!digits) return { score: 0, flags: ["UNPARSEABLE"], valid: false };

  const allFlags: string[] = [];

  allFlags.push(...checkFormat(digits));
  allFlags.push(...checkAreaCode(digits));
  allFlags.push(...checkGeoMatch(digits, state));

  const freq = phoneMap.phoneFrequency.get(digits) || 0;
  const nameCount = phoneMap.phoneNames.get(digits)?.size || 0;
  const catCount = phoneMap.phoneCategories.get(digits)?.size || 0;

  if (freq >= 5) allFlags.push("HIGH_FREQUENCY_" + freq);
  else if (freq >= 3) allFlags.push("SHARED_NUMBER");

  if (nameCount >= 5) allFlags.push("MULTI_BUSINESS_" + nameCount);
  else if (nameCount >= 3) allFlags.push("FEW_BUSINESSES");

  if (catCount >= 3) allFlags.push("MULTI_CATEGORY");

  if (phoneMap.sequentialBlocks.has(digits)) allFlags.push("SEQUENTIAL_BLOCK");

  const deductions: Record<string, number> = {
    INVALID_LENGTH: 100,
    ALL_SAME_DIGITS: 100,
    SEQUENTIAL_PATTERN: 100,
    INVALID_FIRST_DIGIT: 80,
    FICTIONAL_555: 100,
    SUSPICIOUS_555: 40,
    INVALID_EXCHANGE: 60,
    SUSPICIOUS_SUFFIX: 15,
    TOLL_FREE: 25,
    PREMIUM_RATE: 60,
    UNKNOWN_AREA_CODE: 50,
    GEO_MISMATCH: 15,
    SHARED_NUMBER: 10,
    FEW_BUSINESSES: 15,
    MULTI_CATEGORY: 10,
    SEQUENTIAL_BLOCK: 20,
  };

  let score = 100;
  for (const flag of allFlags) {
    if (deductions[flag] !== undefined) {
      score -= deductions[flag];
    } else if (flag.startsWith("HIGH_FREQUENCY_")) {
      const n = parseInt(flag.split("_")[2]);
      score -= Math.min(50, n * 5);
    } else if (flag.startsWith("MULTI_BUSINESS_")) {
      const n = parseInt(flag.split("_")[2]);
      score -= Math.min(40, n * 5);
    }
  }

  score = Math.max(0, Math.min(100, score));

  return { score, flags: allFlags, valid: score >= 50 };
}
