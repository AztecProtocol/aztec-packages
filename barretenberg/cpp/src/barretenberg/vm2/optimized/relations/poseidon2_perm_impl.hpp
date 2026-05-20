// Hand-tuned implementation of the poseidon2_perm relation.
//
// This file replaces the auto-generated `generated/relations/poseidon2_perm_impl.hpp` to cut
// compile time for the TU (the auto-generated file is ~1600 lines / ~107 KB and ~44 s to compile).
//
// Optimisations relative to the auto-generated form:
//   1. The 92 round constants and 3 derived M3 constants are hoisted from the body of
//      `accumulate` to namespace scope as variable templates. The compiler instantiates each
//      constant once per `FF` rather than walking the same `FF(uint256_t{...})` decl inside
//      every `accumulate` template specialisation (~5 specialisations live).
//   2. The per-subrelation `using View = std::tuple_element_t<N, ContainerOverSubrelations>::View;`
//      alias is hoisted once at the top of `accumulate` — every subrelation index resolves to
//      the same `View` type, so the 100 redundant `tuple_element_t` lookups collapse to one.
//   3. The selector column read `static_cast<View>(in.get(C::poseidon2_perm_sel))` is hoisted
//      once at the top of `accumulate` instead of being re-emitted at each of the 100
//      subrelation blocks.
#pragma once

#include "barretenberg/common/constexpr_utils.hpp"
#include "barretenberg/vm2/constraining/relations/relation_macros.hpp"
#include "barretenberg/vm2/optimized/relations/poseidon2_perm.hpp"

namespace bb::avm2 {

namespace poseidon2_perm_constants {

template <typename FF>
inline const FF poseidon2_params_MU_0{ uint256_t{
    13071735289386612455UL, 937867514930142591UL, 338297992309721356UL, 1214967615784395659UL } };
template <typename FF>
inline const FF poseidon2_params_MU_1{ uint256_t{
    12135856085615145995UL, 11087747206803725188UL, 92802976007797685UL, 875972510381039422UL } };
template <typename FF>
inline const FF poseidon2_params_MU_2{ uint256_t{
    8072276821399088149UL, 12835106910674049377UL, 12882375598172350360UL, 23726925003953432UL } };
template <typename FF>
inline const FF poseidon2_params_MU_3{ uint256_t{
    1422103134736368267UL, 5972060781611222310UL, 3327741120806881763UL, 2462344296021899375UL } };
template <typename FF>
inline const FF poseidon2_params_C_0_0{ uint256_t{
    10018390284920759269UL, 196898842818127395UL, 5249540449481148995UL, 1853312570062057576UL } };
template <typename FF>
inline const FF poseidon2_params_C_0_1{ uint256_t{
    12486221224710452438UL, 2372038863109147677UL, 8230667498854222355UL, 2764611904404804029UL } };
template <typename FF>
inline const FF poseidon2_params_C_0_2{ uint256_t{
    4466505105966356650UL, 4686185096558265002UL, 16210260819355521378UL, 1844031548168280073UL } };
template <typename FF>
inline const FF poseidon2_params_C_0_3{ uint256_t{
    15002325471271702008UL, 5581154705073500415UL, 1229208533183169201UL, 1549225070791782920UL } };
template <typename FF>
inline const FF poseidon2_params_C_1_0{ uint256_t{
    18309653156114024706UL, 798761732958817262UL, 6904962453156279281UL, 3335412762186210716UL } };
template <typename FF>
inline const FF poseidon2_params_C_1_1{ uint256_t{
    2824096028161810206UL, 14640933461146357672UL, 957840840567621315UL, 1024001058677493842UL } };
template <typename FF>
inline const FF poseidon2_params_C_1_2{ uint256_t{
    14339023814126516630UL, 12239068001133297662UL, 428134084092645147UL, 2673682960814460689UL } };
template <typename FF>
inline const FF poseidon2_params_C_1_3{ uint256_t{
    6214865908119297870UL, 17923963059035301363UL, 10985380589240272449UL, 1430464474809378870UL } };
template <typename FF>
inline const FF poseidon2_params_C_2_0{ uint256_t{
    5109255232332580664UL, 11913027714091798733UL, 4449570166290740355UL, 864862123557185234UL } };
template <typename FF>
inline const FF poseidon2_params_C_2_1{ uint256_t{
    2323272968957708806UL, 354488099726909104UL, 115174089281514891UL, 80808271106704719UL } };
template <typename FF>
inline const FF poseidon2_params_C_2_2{ uint256_t{
    9646436663147525449UL, 3404572679246369876UL, 2350204275212843361UL, 1069216089054537871UL } };
template <typename FF>
inline const FF poseidon2_params_C_2_3{ uint256_t{
    5059356740217174171UL, 4245857056683447103UL, 2426504795124362174UL, 350059533408463330UL } };
template <typename FF>
inline const FF poseidon2_params_C_3_0{ uint256_t{
    14876286709841668328UL, 6932857857384975351UL, 7976037835777844091UL, 738350885205242785UL } };
template <typename FF>
inline const FF poseidon2_params_C_3_1{ uint256_t{
    16522097747524989503UL, 4157368317794149558UL, 10343110624935622906UL, 2709590753056582169UL } };
template <typename FF>
inline const FF poseidon2_params_C_3_2{ uint256_t{
    8805379462752425633UL, 8594508728147436821UL, 15629690186821248127UL, 2936193411053712582UL } };
template <typename FF>
inline const FF poseidon2_params_C_3_3{ uint256_t{
    17046614324338172999UL, 14086280776151114414UL, 2804088968006330580UL, 728643340397380469UL } };
template <typename FF>
inline const FF poseidon2_params_C_4_0{ uint256_t{
    12986735346000814543UL, 6140074342411686364UL, 6041575944194691717UL, 896092723329689904UL } };
template <typename FF>
inline const FF poseidon2_params_C_5_0{ uint256_t{
    9573905030842087441UL, 12243211539080976096UL, 15287161151491266826UL, 1310836290481124728UL } };
template <typename FF>
inline const FF poseidon2_params_C_6_0{ uint256_t{
    8865134002163281525UL, 6813849753829831047UL, 9066778847678578696UL, 2801725307463304665UL } };
template <typename FF>
inline const FF poseidon2_params_C_7_0{ uint256_t{
    4931814869361681093UL, 13712769805002511750UL, 1776191062268299644UL, 2068661504023016414UL } };
template <typename FF>
inline const FF poseidon2_params_C_8_0{ uint256_t{
    8161631444256445904UL, 3049786034047984668UL, 1021328518293651309UL, 2147500022207188878UL } };
template <typename FF>
inline const FF poseidon2_params_C_9_0{ uint256_t{
    12766468767470212468UL, 926098071429114297UL, 17691598410912255471UL, 76565467953470566UL } };
template <typename FF>
inline const FF poseidon2_params_C_10_0{ uint256_t{
    15547843034426617484UL, 13465733818561903358UL, 11157089789589945854UL, 3107062195097242290UL } };
template <typename FF>
inline const FF poseidon2_params_C_11_0{ uint256_t{
    16908372174309343397UL, 17264932925429761530UL, 11508063480483774160UL, 2682419245684831641UL } };
template <typename FF>
inline const FF poseidon2_params_C_12_0{ uint256_t{
    4870692136216401181UL, 17645600130793395310UL, 2758876031472241166UL, 874943362207641089UL } };
template <typename FF>
inline const FF poseidon2_params_C_13_0{ uint256_t{
    4540479402638267003UL, 13477556963426049071UL, 6055112305493291757UL, 1810598527648098537UL } };
template <typename FF>
inline const FF poseidon2_params_C_14_0{ uint256_t{
    7894770769272900997UL, 9595210915998428021UL, 7642295683223718917UL, 2210716392790471408UL } };
template <typename FF>
inline const FF poseidon2_params_C_15_0{ uint256_t{
    10910178561156475899UL, 15811627963917441510UL, 16460518660187536520UL, 1698297851221778809UL } };
template <typename FF>
inline const FF poseidon2_params_C_16_0{ uint256_t{
    7831732902708890908UL, 1464390598836302271UL, 8568564606321342514UL, 3007171090439369509UL } };
template <typename FF>
inline const FF poseidon2_params_C_17_0{ uint256_t{
    12758232712903990792UL, 5937193763836963893UL, 4629415695575460109UL, 2476198378403296665UL } };
template <typename FF>
inline const FF poseidon2_params_C_18_0{ uint256_t{
    16185652584871361881UL, 3161867062328690813UL, 8447947510117581907UL, 452436262606194895UL } };
template <typename FF>
inline const FF poseidon2_params_C_19_0{ uint256_t{
    10531967515434376071UL, 5577695765815843856UL, 9164856352050088505UL, 1205339682110411496UL } };
template <typename FF>
inline const FF poseidon2_params_C_20_0{ uint256_t{
    3898841196333713180UL, 14650521577519770525UL, 5736581618852866049UL, 1010789789328495026UL } };
template <typename FF>
inline const FF poseidon2_params_C_21_0{ uint256_t{
    12103741763020280571UL, 14760208106156268938UL, 15246749619665902195UL, 1987439155030896717UL } };
template <typename FF>
inline const FF poseidon2_params_C_22_0{ uint256_t{
    326429241861474059UL, 11335157279655967493UL, 16233357323017397007UL, 2124770605461456708UL } };
template <typename FF>
inline const FF poseidon2_params_C_23_0{ uint256_t{
    13507610432344102875UL, 9765425316929074945UL, 10455054851855122687UL, 3371280263716451574UL } };
template <typename FF>
inline const FF poseidon2_params_C_24_0{ uint256_t{
    9433430149246843174UL, 16916651192445074064UL, 12002862125451454299UL, 3293088726774108791UL } };
template <typename FF>
inline const FF poseidon2_params_C_25_0{ uint256_t{
    15895963712096768440UL, 10975964170403460506UL, 7594578539046143282UL, 441635248990433378UL } };
template <typename FF>
inline const FF poseidon2_params_C_26_0{ uint256_t{
    55564641555031451UL, 2316046008873247993UL, 6273091099984972305UL, 531938487375579818UL } };
template <typename FF>
inline const FF poseidon2_params_C_27_0{ uint256_t{
    17845282940759944461UL, 6735239388814238924UL, 3181517889518583601UL, 2376846283559998361UL } };
template <typename FF>
inline const FF poseidon2_params_C_28_0{ uint256_t{
    14097127963645492314UL, 1165420652731038559UL, 12527303660854712762UL, 2717289076364278965UL } };
template <typename FF>
inline const FF poseidon2_params_C_29_0{ uint256_t{
    15600044695084040011UL, 255324662529267034UL, 11859356122961343981UL, 2571979992654075442UL } };
template <typename FF>
inline const FF poseidon2_params_C_30_0{ uint256_t{
    1589817027469470176UL, 1086723465680833706UL, 6948011514366564799UL, 2482410610948543635UL } };
template <typename FF>
inline const FF poseidon2_params_C_31_0{ uint256_t{
    6071201116374785253UL, 16554668458221199618UL, 16319484688832471879UL, 2792452762383364279UL } };
template <typename FF>
inline const FF poseidon2_params_C_32_0{ uint256_t{
    13535048470209809113UL, 1831807297936988201UL, 16757520396573457190UL, 508291910620511162UL } };
template <typename FF>
inline const FF poseidon2_params_C_33_0{ uint256_t{
    6946737468087619802UL, 14033399912488027565UL, 12701200401813783486UL, 1348363389498465135UL } };
template <typename FF>
inline const FF poseidon2_params_C_34_0{ uint256_t{
    6788008051328210729UL, 13866524545426155292UL, 4317879914214157329UL, 2633928310905799638UL } };
template <typename FF>
inline const FF poseidon2_params_C_35_0{ uint256_t{
    1183626302001490602UL, 10035686235057284266UL, 1656321729167440177UL, 1887128381037099784UL } };
template <typename FF>
inline const FF poseidon2_params_C_36_0{ uint256_t{
    964566190254741199UL, 17650087760652370459UL, 14904592615785317921UL, 2929864473487096026UL } };
template <typename FF>
inline const FF poseidon2_params_C_37_0{ uint256_t{
    13584300701347139198UL, 512534187550045064UL, 13489711551083721364UL, 41824696873363624UL } };
template <typename FF>
inline const FF poseidon2_params_C_38_0{ uint256_t{
    17586611824788147557UL, 6430987250922925699UL, 9294838151373947091UL, 348446557360066429UL } };
template <typename FF>
inline const FF poseidon2_params_C_39_0{ uint256_t{
    15025298913764434311UL, 14393211163878018166UL, 7154440178410267241UL, 3057088631006286899UL } };
template <typename FF>
inline const FF poseidon2_params_C_40_0{ uint256_t{
    13451769229280519155UL, 17839347496757587523UL, 10553299811918798519UL, 2523373819901075642UL } };
template <typename FF>
inline const FF poseidon2_params_C_41_0{ uint256_t{
    16267315463205810352UL, 13830706729545301172UL, 15413288900478726729UL, 287556136711008934UL } };
template <typename FF>
inline const FF poseidon2_params_C_42_0{ uint256_t{
    4573780169675443044UL, 8758089751960064775UL, 2470295096511057988UL, 51551212240288730UL } };
template <typename FF>
inline const FF poseidon2_params_C_43_0{ uint256_t{
    7093949836145798554UL, 12771428392262798771UL, 17021632567931004395UL, 1558106578814965657UL } };
template <typename FF>
inline const FF poseidon2_params_C_44_0{ uint256_t{
    8205915653008540447UL, 10376314495036230740UL, 5774593793305666491UL, 2231830927015656581UL } };
template <typename FF>
inline const FF poseidon2_params_C_45_0{ uint256_t{
    10783762484003267341UL, 10229708558604896492UL, 1831638669050696278UL, 2190429714552610800UL } };
template <typename FF>
inline const FF poseidon2_params_C_46_0{ uint256_t{
    7310961803978392383UL, 12793746113455595394UL, 17036245927795997300UL, 3106081169494120044UL } };
template <typename FF>
inline const FF poseidon2_params_C_47_0{ uint256_t{
    17421859032088162675UL, 7339791467855418851UL, 4622175020331968961UL, 590786792834928630UL } };
template <typename FF>
inline const FF poseidon2_params_C_48_0{ uint256_t{
    14242884250645212438UL, 12806057845811725595UL, 7743423753614082490UL, 213381026777379804UL } };
template <typename FF>
inline const FF poseidon2_params_C_49_0{ uint256_t{
    1110713325513004805UL, 8318407684973846516UL, 15952888485475298710UL, 1018983205230111328UL } };
template <typename FF>
inline const FF poseidon2_params_C_50_0{ uint256_t{
    533883137631233338UL, 333001117808183237UL, 16968583542443855481UL, 329716098711096173UL } };
template <typename FF>
inline const FF poseidon2_params_C_51_0{ uint256_t{
    4449676039486426793UL, 7760073051300251162UL, 5615103291054015906UL, 2516053143677338215UL } };
template <typename FF>
inline const FF poseidon2_params_C_52_0{ uint256_t{
    16503526645482286870UL, 6358830762575712333UL, 12313512559299087688UL, 2716767262544184013UL } };
template <typename FF>
inline const FF poseidon2_params_C_53_0{ uint256_t{
    5426798011730033104UL, 13085704829880126552UL, 6356732802364281819UL, 2175930396888807151UL } };
template <typename FF>
inline const FF poseidon2_params_C_54_0{ uint256_t{
    8262282602783970021UL, 2576069526442506486UL, 14199683559983367515UL, 3432491072538425468UL } };
template <typename FF>
inline const FF poseidon2_params_C_55_0{ uint256_t{
    14778817021916755205UL, 6110468871588391807UL, 2850248286812407967UL, 3411084787375678665UL } };
template <typename FF>
inline const FF poseidon2_params_C_56_0{ uint256_t{
    4906200604739023933UL, 12096549814065429793UL, 5988343102643160344UL, 309820751832846301UL } };
template <typename FF>
inline const FF poseidon2_params_C_57_0{ uint256_t{
    8709336210313678885UL, 10520000332606345601UL, 4756441214598660785UL, 2483744946546306397UL } };
template <typename FF>
inline const FF poseidon2_params_C_58_0{ uint256_t{
    9617950371599090517UL, 6702332727289490762UL, 7078214601245292934UL, 215269160536524476UL } };
template <typename FF>
inline const FF poseidon2_params_C_59_0{ uint256_t{
    14694170287735041964UL, 13462371741453101277UL, 7691247574208617782UL, 1078917709155142535UL } };
template <typename FF>
inline const FF poseidon2_params_C_60_0{ uint256_t{
    17559938410729200952UL, 12326273425107991305UL, 8641129484519639030UL, 1699848340767391255UL } };
template <typename FF>
inline const FF poseidon2_params_C_60_1{ uint256_t{
    3946956839294125797UL, 10123891284815211853UL, 3676846437799665248UL, 753827773683953838UL } };
template <typename FF>
inline const FF poseidon2_params_C_60_2{ uint256_t{
    10815195850656127580UL, 17940782720817522247UL, 11666428030894512886UL, 2305765957929457259UL } };
template <typename FF>
inline const FF poseidon2_params_C_60_3{ uint256_t{
    437280840171101279UL, 6885928680245806601UL, 6031863836827793624UL, 2698250255620259624UL } };
template <typename FF>
inline const FF poseidon2_params_C_61_0{ uint256_t{
    16961604592822056794UL, 12516844188945734293UL, 2404426354458718742UL, 901141949721836097UL } };
template <typename FF>
inline const FF poseidon2_params_C_61_1{ uint256_t{
    3152898413090790038UL, 16108523113696338432UL, 11492645026300260534UL, 1417477149741880787UL } };
template <typename FF>
inline const FF poseidon2_params_C_61_2{ uint256_t{
    10578217394647568846UL, 6637113826221079930UL, 1364449097464563400UL, 2379869735503406314UL } };
template <typename FF>
inline const FF poseidon2_params_C_61_3{ uint256_t{
    6332539588517624153UL, 17422837239624809585UL, 12296960536238467913UL, 2434905421004621494UL } };
template <typename FF>
inline const FF poseidon2_params_C_62_0{ uint256_t{
    10311634121439582299UL, 2959376558854333994UL, 6697398963915560134UL, 417944321386245900UL } };
template <typename FF>
inline const FF poseidon2_params_C_62_1{ uint256_t{
    16872849857899172004UL, 1640712307042701286UL, 16457516735210998920UL, 1084862449077757478UL } };
template <typename FF>
inline const FF poseidon2_params_C_62_2{ uint256_t{
    10329879351081882815UL, 5178010365334480003UL, 7014208314719145622UL, 385149140585498380UL } };
template <typename FF>
inline const FF poseidon2_params_C_62_3{ uint256_t{
    13199866221884806229UL, 10541991787372042848UL, 14909749656931548440UL, 708152185224876794UL } };
template <typename FF>
inline const FF poseidon2_params_C_63_0{ uint256_t{
    1717216310632203061UL, 17455832130858697862UL, 5278085098799702411UL, 227655898188482835UL } };
template <typename FF>
inline const FF poseidon2_params_C_63_1{ uint256_t{
    17164141620747686731UL, 16689913387728553544UL, 2568326884589391367UL, 3166155980659486882UL } };
template <typename FF>
inline const FF poseidon2_params_C_63_2{ uint256_t{
    1233442753680249567UL, 15490006495937952898UL, 7249042245074469654UL, 2138985910652398451UL } };
template <typename FF>
inline const FF poseidon2_params_C_63_3{ uint256_t{
    4115849303762846724UL, 2230284817967990783UL, 5095423606777193313UL, 1685862792723606183UL } };
template <typename FF> inline const FF poseidon2_params_M3_11 = poseidon2_params_MU_1<FF> + FF(1);
template <typename FF> inline const FF poseidon2_params_M3_22 = poseidon2_params_MU_2<FF> + FF(1);
template <typename FF> inline const FF poseidon2_params_M3_33 = poseidon2_params_MU_3<FF> + FF(1);

} // namespace poseidon2_perm_constants

template <typename FF_>
template <typename ContainerOverSubrelations, typename AllEntities>
void optimized_poseidon2_permImpl<FF_>::accumulate(ContainerOverSubrelations& evals,
                                                   const AllEntities& in,
                                                   [[maybe_unused]] const RelationParameters<FF_>&,
                                                   [[maybe_unused]] const FF_& scaling_factor)
{
    using namespace poseidon2_perm_constants;
    using C = ColumnAndShifts;

    const auto poseidon2_perm_EXT_LAYER_0 = in.get(C::poseidon2_perm_a_0) + in.get(C::poseidon2_perm_a_1);
    const auto poseidon2_perm_EXT_LAYER_1 = in.get(C::poseidon2_perm_a_2) + in.get(C::poseidon2_perm_a_3);
    const auto poseidon2_perm_EXT_LAYER_2 = FF(2) * in.get(C::poseidon2_perm_a_1) + poseidon2_perm_EXT_LAYER_1;
    const auto poseidon2_perm_EXT_LAYER_3 = FF(2) * in.get(C::poseidon2_perm_a_3) + poseidon2_perm_EXT_LAYER_0;
    const auto poseidon2_perm_ARK_0_0 = in.get(C::poseidon2_perm_EXT_LAYER_6) + poseidon2_params_C_0_0<FF>;
    const auto poseidon2_perm_ARK_0_1 = in.get(C::poseidon2_perm_EXT_LAYER_5) + poseidon2_params_C_0_1<FF>;
    const auto poseidon2_perm_ARK_0_2 = in.get(C::poseidon2_perm_EXT_LAYER_7) + poseidon2_params_C_0_2<FF>;
    const auto poseidon2_perm_ARK_0_3 = in.get(C::poseidon2_perm_EXT_LAYER_4) + poseidon2_params_C_0_3<FF>;
    const auto poseidon2_perm_A_0_0 = poseidon2_perm_ARK_0_0 * poseidon2_perm_ARK_0_0 * poseidon2_perm_ARK_0_0 *
                                      poseidon2_perm_ARK_0_0 * poseidon2_perm_ARK_0_0;
    const auto poseidon2_perm_A_0_1 = poseidon2_perm_ARK_0_1 * poseidon2_perm_ARK_0_1 * poseidon2_perm_ARK_0_1 *
                                      poseidon2_perm_ARK_0_1 * poseidon2_perm_ARK_0_1;
    const auto poseidon2_perm_A_0_2 = poseidon2_perm_ARK_0_2 * poseidon2_perm_ARK_0_2 * poseidon2_perm_ARK_0_2 *
                                      poseidon2_perm_ARK_0_2 * poseidon2_perm_ARK_0_2;
    const auto poseidon2_perm_A_0_3 = poseidon2_perm_ARK_0_3 * poseidon2_perm_ARK_0_3 * poseidon2_perm_ARK_0_3 *
                                      poseidon2_perm_ARK_0_3 * poseidon2_perm_ARK_0_3;
    const auto poseidon2_perm_T_0_0 = poseidon2_perm_A_0_0 + poseidon2_perm_A_0_1;
    const auto poseidon2_perm_T_0_1 = poseidon2_perm_A_0_2 + poseidon2_perm_A_0_3;
    const auto poseidon2_perm_T_0_2 = FF(2) * poseidon2_perm_A_0_1 + poseidon2_perm_T_0_1;
    const auto poseidon2_perm_T_0_3 = FF(2) * poseidon2_perm_A_0_3 + poseidon2_perm_T_0_0;
    const auto poseidon2_perm_ARK_1_0 = in.get(C::poseidon2_perm_T_0_6) + poseidon2_params_C_1_0<FF>;
    const auto poseidon2_perm_ARK_1_1 = in.get(C::poseidon2_perm_T_0_5) + poseidon2_params_C_1_1<FF>;
    const auto poseidon2_perm_ARK_1_2 = in.get(C::poseidon2_perm_T_0_7) + poseidon2_params_C_1_2<FF>;
    const auto poseidon2_perm_ARK_1_3 = in.get(C::poseidon2_perm_T_0_4) + poseidon2_params_C_1_3<FF>;
    const auto poseidon2_perm_A_1_0 = poseidon2_perm_ARK_1_0 * poseidon2_perm_ARK_1_0 * poseidon2_perm_ARK_1_0 *
                                      poseidon2_perm_ARK_1_0 * poseidon2_perm_ARK_1_0;
    const auto poseidon2_perm_A_1_1 = poseidon2_perm_ARK_1_1 * poseidon2_perm_ARK_1_1 * poseidon2_perm_ARK_1_1 *
                                      poseidon2_perm_ARK_1_1 * poseidon2_perm_ARK_1_1;
    const auto poseidon2_perm_A_1_2 = poseidon2_perm_ARK_1_2 * poseidon2_perm_ARK_1_2 * poseidon2_perm_ARK_1_2 *
                                      poseidon2_perm_ARK_1_2 * poseidon2_perm_ARK_1_2;
    const auto poseidon2_perm_A_1_3 = poseidon2_perm_ARK_1_3 * poseidon2_perm_ARK_1_3 * poseidon2_perm_ARK_1_3 *
                                      poseidon2_perm_ARK_1_3 * poseidon2_perm_ARK_1_3;
    const auto poseidon2_perm_T_1_0 = poseidon2_perm_A_1_0 + poseidon2_perm_A_1_1;
    const auto poseidon2_perm_T_1_1 = poseidon2_perm_A_1_2 + poseidon2_perm_A_1_3;
    const auto poseidon2_perm_T_1_2 = FF(2) * poseidon2_perm_A_1_1 + poseidon2_perm_T_1_1;
    const auto poseidon2_perm_T_1_3 = FF(2) * poseidon2_perm_A_1_3 + poseidon2_perm_T_1_0;
    const auto poseidon2_perm_ARK_2_0 = in.get(C::poseidon2_perm_T_1_6) + poseidon2_params_C_2_0<FF>;
    const auto poseidon2_perm_ARK_2_1 = in.get(C::poseidon2_perm_T_1_5) + poseidon2_params_C_2_1<FF>;
    const auto poseidon2_perm_ARK_2_2 = in.get(C::poseidon2_perm_T_1_7) + poseidon2_params_C_2_2<FF>;
    const auto poseidon2_perm_ARK_2_3 = in.get(C::poseidon2_perm_T_1_4) + poseidon2_params_C_2_3<FF>;
    const auto poseidon2_perm_A_2_0 = poseidon2_perm_ARK_2_0 * poseidon2_perm_ARK_2_0 * poseidon2_perm_ARK_2_0 *
                                      poseidon2_perm_ARK_2_0 * poseidon2_perm_ARK_2_0;
    const auto poseidon2_perm_A_2_1 = poseidon2_perm_ARK_2_1 * poseidon2_perm_ARK_2_1 * poseidon2_perm_ARK_2_1 *
                                      poseidon2_perm_ARK_2_1 * poseidon2_perm_ARK_2_1;
    const auto poseidon2_perm_A_2_2 = poseidon2_perm_ARK_2_2 * poseidon2_perm_ARK_2_2 * poseidon2_perm_ARK_2_2 *
                                      poseidon2_perm_ARK_2_2 * poseidon2_perm_ARK_2_2;
    const auto poseidon2_perm_A_2_3 = poseidon2_perm_ARK_2_3 * poseidon2_perm_ARK_2_3 * poseidon2_perm_ARK_2_3 *
                                      poseidon2_perm_ARK_2_3 * poseidon2_perm_ARK_2_3;
    const auto poseidon2_perm_T_2_0 = poseidon2_perm_A_2_0 + poseidon2_perm_A_2_1;
    const auto poseidon2_perm_T_2_1 = poseidon2_perm_A_2_2 + poseidon2_perm_A_2_3;
    const auto poseidon2_perm_T_2_2 = FF(2) * poseidon2_perm_A_2_1 + poseidon2_perm_T_2_1;
    const auto poseidon2_perm_T_2_3 = FF(2) * poseidon2_perm_A_2_3 + poseidon2_perm_T_2_0;
    const auto poseidon2_perm_ARK_3_0 = in.get(C::poseidon2_perm_T_2_6) + poseidon2_params_C_3_0<FF>;
    const auto poseidon2_perm_ARK_3_1 = in.get(C::poseidon2_perm_T_2_5) + poseidon2_params_C_3_1<FF>;
    const auto poseidon2_perm_ARK_3_2 = in.get(C::poseidon2_perm_T_2_7) + poseidon2_params_C_3_2<FF>;
    const auto poseidon2_perm_ARK_3_3 = in.get(C::poseidon2_perm_T_2_4) + poseidon2_params_C_3_3<FF>;
    const auto poseidon2_perm_A_3_0 = poseidon2_perm_ARK_3_0 * poseidon2_perm_ARK_3_0 * poseidon2_perm_ARK_3_0 *
                                      poseidon2_perm_ARK_3_0 * poseidon2_perm_ARK_3_0;
    const auto poseidon2_perm_A_3_1 = poseidon2_perm_ARK_3_1 * poseidon2_perm_ARK_3_1 * poseidon2_perm_ARK_3_1 *
                                      poseidon2_perm_ARK_3_1 * poseidon2_perm_ARK_3_1;
    const auto poseidon2_perm_A_3_2 = poseidon2_perm_ARK_3_2 * poseidon2_perm_ARK_3_2 * poseidon2_perm_ARK_3_2 *
                                      poseidon2_perm_ARK_3_2 * poseidon2_perm_ARK_3_2;
    const auto poseidon2_perm_A_3_3 = poseidon2_perm_ARK_3_3 * poseidon2_perm_ARK_3_3 * poseidon2_perm_ARK_3_3 *
                                      poseidon2_perm_ARK_3_3 * poseidon2_perm_ARK_3_3;
    const auto poseidon2_perm_T_3_0 = poseidon2_perm_A_3_0 + poseidon2_perm_A_3_1;
    const auto poseidon2_perm_T_3_1 = poseidon2_perm_A_3_2 + poseidon2_perm_A_3_3;
    const auto poseidon2_perm_T_3_2 = FF(2) * poseidon2_perm_A_3_1 + poseidon2_perm_T_3_1;
    const auto poseidon2_perm_T_3_3 = FF(2) * poseidon2_perm_A_3_3 + poseidon2_perm_T_3_0;
    const auto poseidon2_perm_B_3_0 = in.get(C::poseidon2_perm_T_3_6);
    const auto poseidon2_perm_B_3_1 = in.get(C::poseidon2_perm_T_3_5);
    const auto poseidon2_perm_B_3_2 = in.get(C::poseidon2_perm_T_3_7);
    const auto poseidon2_perm_B_3_3 = in.get(C::poseidon2_perm_T_3_4);
    // ===== Partial-round chain (rows 4..59) =====
    // The chain follows: ARK_n = B_{n-1}_0 + C_n_0; ALPHA_n = ARK_n^5; (X,Y,Z) update.
    // Stored as length-56 arrays: ALPHA[i] := ALPHA_{i+1}, X[i] := X_{i+1}, Y[i] := Y_{i+1}, Z[i] := Z_{i+1}.
    constexpr std::array<C, 56> B_partial_cols = {
        C::poseidon2_perm_B_4_0,  C::poseidon2_perm_B_5_0,  C::poseidon2_perm_B_6_0,  C::poseidon2_perm_B_7_0,
        C::poseidon2_perm_B_8_0,  C::poseidon2_perm_B_9_0,  C::poseidon2_perm_B_10_0, C::poseidon2_perm_B_11_0,
        C::poseidon2_perm_B_12_0, C::poseidon2_perm_B_13_0, C::poseidon2_perm_B_14_0, C::poseidon2_perm_B_15_0,
        C::poseidon2_perm_B_16_0, C::poseidon2_perm_B_17_0, C::poseidon2_perm_B_18_0, C::poseidon2_perm_B_19_0,
        C::poseidon2_perm_B_20_0, C::poseidon2_perm_B_21_0, C::poseidon2_perm_B_22_0, C::poseidon2_perm_B_23_0,
        C::poseidon2_perm_B_24_0, C::poseidon2_perm_B_25_0, C::poseidon2_perm_B_26_0, C::poseidon2_perm_B_27_0,
        C::poseidon2_perm_B_28_0, C::poseidon2_perm_B_29_0, C::poseidon2_perm_B_30_0, C::poseidon2_perm_B_31_0,
        C::poseidon2_perm_B_32_0, C::poseidon2_perm_B_33_0, C::poseidon2_perm_B_34_0, C::poseidon2_perm_B_35_0,
        C::poseidon2_perm_B_36_0, C::poseidon2_perm_B_37_0, C::poseidon2_perm_B_38_0, C::poseidon2_perm_B_39_0,
        C::poseidon2_perm_B_40_0, C::poseidon2_perm_B_41_0, C::poseidon2_perm_B_42_0, C::poseidon2_perm_B_43_0,
        C::poseidon2_perm_B_44_0, C::poseidon2_perm_B_45_0, C::poseidon2_perm_B_46_0, C::poseidon2_perm_B_47_0,
        C::poseidon2_perm_B_48_0, C::poseidon2_perm_B_49_0, C::poseidon2_perm_B_50_0, C::poseidon2_perm_B_51_0,
        C::poseidon2_perm_B_52_0, C::poseidon2_perm_B_53_0, C::poseidon2_perm_B_54_0, C::poseidon2_perm_B_55_0,
        C::poseidon2_perm_B_56_0, C::poseidon2_perm_B_57_0, C::poseidon2_perm_B_58_0, C::poseidon2_perm_B_59_0
    };
    const std::array<FF, 56> C_partial = {
        poseidon2_params_C_4_0<FF>,  poseidon2_params_C_5_0<FF>,  poseidon2_params_C_6_0<FF>,
        poseidon2_params_C_7_0<FF>,  poseidon2_params_C_8_0<FF>,  poseidon2_params_C_9_0<FF>,
        poseidon2_params_C_10_0<FF>, poseidon2_params_C_11_0<FF>, poseidon2_params_C_12_0<FF>,
        poseidon2_params_C_13_0<FF>, poseidon2_params_C_14_0<FF>, poseidon2_params_C_15_0<FF>,
        poseidon2_params_C_16_0<FF>, poseidon2_params_C_17_0<FF>, poseidon2_params_C_18_0<FF>,
        poseidon2_params_C_19_0<FF>, poseidon2_params_C_20_0<FF>, poseidon2_params_C_21_0<FF>,
        poseidon2_params_C_22_0<FF>, poseidon2_params_C_23_0<FF>, poseidon2_params_C_24_0<FF>,
        poseidon2_params_C_25_0<FF>, poseidon2_params_C_26_0<FF>, poseidon2_params_C_27_0<FF>,
        poseidon2_params_C_28_0<FF>, poseidon2_params_C_29_0<FF>, poseidon2_params_C_30_0<FF>,
        poseidon2_params_C_31_0<FF>, poseidon2_params_C_32_0<FF>, poseidon2_params_C_33_0<FF>,
        poseidon2_params_C_34_0<FF>, poseidon2_params_C_35_0<FF>, poseidon2_params_C_36_0<FF>,
        poseidon2_params_C_37_0<FF>, poseidon2_params_C_38_0<FF>, poseidon2_params_C_39_0<FF>,
        poseidon2_params_C_40_0<FF>, poseidon2_params_C_41_0<FF>, poseidon2_params_C_42_0<FF>,
        poseidon2_params_C_43_0<FF>, poseidon2_params_C_44_0<FF>, poseidon2_params_C_45_0<FF>,
        poseidon2_params_C_46_0<FF>, poseidon2_params_C_47_0<FF>, poseidon2_params_C_48_0<FF>,
        poseidon2_params_C_49_0<FF>, poseidon2_params_C_50_0<FF>, poseidon2_params_C_51_0<FF>,
        poseidon2_params_C_52_0<FF>, poseidon2_params_C_53_0<FF>, poseidon2_params_C_54_0<FF>,
        poseidon2_params_C_55_0<FF>, poseidon2_params_C_56_0<FF>, poseidon2_params_C_57_0<FF>,
        poseidon2_params_C_58_0<FF>, poseidon2_params_C_59_0<FF>
    };
    using ChainElem = std::decay_t<decltype(poseidon2_params_M3_11<FF> * in.get(C::poseidon2_perm_T_3_5))>;
    std::array<ChainElem, 56> poseidon2_perm_ALPHA{}; // ALPHA[i] := ALPHA_{i+1}, i in [0, 56)
    std::array<ChainElem, 55> poseidon2_perm_X{}, poseidon2_perm_Y{},
        poseidon2_perm_Z{}; // [i] := *_{i+1}, i in [0, 55)
    {
        const auto ark = poseidon2_perm_B_3_0 + C_partial[0];
        poseidon2_perm_ALPHA[0] = ark * ark * ark * ark * ark;
        poseidon2_perm_X[0] = poseidon2_params_M3_11<FF> * poseidon2_perm_B_3_1 + poseidon2_perm_B_3_2 +
                              poseidon2_perm_B_3_3 + poseidon2_perm_ALPHA[0];
        poseidon2_perm_Y[0] = poseidon2_perm_B_3_1 + poseidon2_params_M3_22<FF> * poseidon2_perm_B_3_2 +
                              poseidon2_perm_B_3_3 + poseidon2_perm_ALPHA[0];
        poseidon2_perm_Z[0] = poseidon2_perm_B_3_1 + poseidon2_perm_B_3_2 +
                              poseidon2_params_M3_33<FF> * poseidon2_perm_B_3_3 + poseidon2_perm_ALPHA[0];
    }
    bb::constexpr_for<1, 56, 1>([&]<size_t i>() {
        const auto ark = in.get(B_partial_cols[i - 1]) + C_partial[i];
        poseidon2_perm_ALPHA[i] = ark * ark * ark * ark * ark;
        if constexpr (i < 55) {
            poseidon2_perm_X[i] = poseidon2_params_M3_11<FF> * poseidon2_perm_X[i - 1] + poseidon2_perm_Y[i - 1] +
                                  poseidon2_perm_Z[i - 1] + poseidon2_perm_ALPHA[i];
            poseidon2_perm_Y[i] = poseidon2_perm_X[i - 1] + poseidon2_params_M3_22<FF> * poseidon2_perm_Y[i - 1] +
                                  poseidon2_perm_Z[i - 1] + poseidon2_perm_ALPHA[i];
            poseidon2_perm_Z[i] = poseidon2_perm_X[i - 1] + poseidon2_perm_Y[i - 1] +
                                  poseidon2_params_M3_33<FF> * poseidon2_perm_Z[i - 1] + poseidon2_perm_ALPHA[i];
        }
    });
    const auto poseidon2_perm_ARK_60_0 = in.get(C::poseidon2_perm_B_59_0) + poseidon2_params_C_60_0<FF>;
    const auto poseidon2_perm_ARK_60_1 = in.get(C::poseidon2_perm_B_59_1) + poseidon2_params_C_60_1<FF>;
    const auto poseidon2_perm_ARK_60_2 = in.get(C::poseidon2_perm_B_59_2) + poseidon2_params_C_60_2<FF>;
    const auto poseidon2_perm_ARK_60_3 = in.get(C::poseidon2_perm_B_59_3) + poseidon2_params_C_60_3<FF>;
    const auto poseidon2_perm_A_60_0 = poseidon2_perm_ARK_60_0 * poseidon2_perm_ARK_60_0 * poseidon2_perm_ARK_60_0 *
                                       poseidon2_perm_ARK_60_0 * poseidon2_perm_ARK_60_0;
    const auto poseidon2_perm_A_60_1 = poseidon2_perm_ARK_60_1 * poseidon2_perm_ARK_60_1 * poseidon2_perm_ARK_60_1 *
                                       poseidon2_perm_ARK_60_1 * poseidon2_perm_ARK_60_1;
    const auto poseidon2_perm_A_60_2 = poseidon2_perm_ARK_60_2 * poseidon2_perm_ARK_60_2 * poseidon2_perm_ARK_60_2 *
                                       poseidon2_perm_ARK_60_2 * poseidon2_perm_ARK_60_2;
    const auto poseidon2_perm_A_60_3 = poseidon2_perm_ARK_60_3 * poseidon2_perm_ARK_60_3 * poseidon2_perm_ARK_60_3 *
                                       poseidon2_perm_ARK_60_3 * poseidon2_perm_ARK_60_3;
    const auto poseidon2_perm_T_60_0 = poseidon2_perm_A_60_0 + poseidon2_perm_A_60_1;
    const auto poseidon2_perm_T_60_1 = poseidon2_perm_A_60_2 + poseidon2_perm_A_60_3;
    const auto poseidon2_perm_T_60_2 = FF(2) * poseidon2_perm_A_60_1 + poseidon2_perm_T_60_1;
    const auto poseidon2_perm_T_60_3 = FF(2) * poseidon2_perm_A_60_3 + poseidon2_perm_T_60_0;
    const auto poseidon2_perm_ARK_61_0 = in.get(C::poseidon2_perm_T_60_6) + poseidon2_params_C_61_0<FF>;
    const auto poseidon2_perm_ARK_61_1 = in.get(C::poseidon2_perm_T_60_5) + poseidon2_params_C_61_1<FF>;
    const auto poseidon2_perm_ARK_61_2 = in.get(C::poseidon2_perm_T_60_7) + poseidon2_params_C_61_2<FF>;
    const auto poseidon2_perm_ARK_61_3 = in.get(C::poseidon2_perm_T_60_4) + poseidon2_params_C_61_3<FF>;
    const auto poseidon2_perm_A_61_0 = poseidon2_perm_ARK_61_0 * poseidon2_perm_ARK_61_0 * poseidon2_perm_ARK_61_0 *
                                       poseidon2_perm_ARK_61_0 * poseidon2_perm_ARK_61_0;
    const auto poseidon2_perm_A_61_1 = poseidon2_perm_ARK_61_1 * poseidon2_perm_ARK_61_1 * poseidon2_perm_ARK_61_1 *
                                       poseidon2_perm_ARK_61_1 * poseidon2_perm_ARK_61_1;
    const auto poseidon2_perm_A_61_2 = poseidon2_perm_ARK_61_2 * poseidon2_perm_ARK_61_2 * poseidon2_perm_ARK_61_2 *
                                       poseidon2_perm_ARK_61_2 * poseidon2_perm_ARK_61_2;
    const auto poseidon2_perm_A_61_3 = poseidon2_perm_ARK_61_3 * poseidon2_perm_ARK_61_3 * poseidon2_perm_ARK_61_3 *
                                       poseidon2_perm_ARK_61_3 * poseidon2_perm_ARK_61_3;
    const auto poseidon2_perm_T_61_0 = poseidon2_perm_A_61_0 + poseidon2_perm_A_61_1;
    const auto poseidon2_perm_T_61_1 = poseidon2_perm_A_61_2 + poseidon2_perm_A_61_3;
    const auto poseidon2_perm_T_61_2 = FF(2) * poseidon2_perm_A_61_1 + poseidon2_perm_T_61_1;
    const auto poseidon2_perm_T_61_3 = FF(2) * poseidon2_perm_A_61_3 + poseidon2_perm_T_61_0;
    const auto poseidon2_perm_ARK_62_0 = in.get(C::poseidon2_perm_T_61_6) + poseidon2_params_C_62_0<FF>;
    const auto poseidon2_perm_ARK_62_1 = in.get(C::poseidon2_perm_T_61_5) + poseidon2_params_C_62_1<FF>;
    const auto poseidon2_perm_ARK_62_2 = in.get(C::poseidon2_perm_T_61_7) + poseidon2_params_C_62_2<FF>;
    const auto poseidon2_perm_ARK_62_3 = in.get(C::poseidon2_perm_T_61_4) + poseidon2_params_C_62_3<FF>;
    const auto poseidon2_perm_A_62_0 = poseidon2_perm_ARK_62_0 * poseidon2_perm_ARK_62_0 * poseidon2_perm_ARK_62_0 *
                                       poseidon2_perm_ARK_62_0 * poseidon2_perm_ARK_62_0;
    const auto poseidon2_perm_A_62_1 = poseidon2_perm_ARK_62_1 * poseidon2_perm_ARK_62_1 * poseidon2_perm_ARK_62_1 *
                                       poseidon2_perm_ARK_62_1 * poseidon2_perm_ARK_62_1;
    const auto poseidon2_perm_A_62_2 = poseidon2_perm_ARK_62_2 * poseidon2_perm_ARK_62_2 * poseidon2_perm_ARK_62_2 *
                                       poseidon2_perm_ARK_62_2 * poseidon2_perm_ARK_62_2;
    const auto poseidon2_perm_A_62_3 = poseidon2_perm_ARK_62_3 * poseidon2_perm_ARK_62_3 * poseidon2_perm_ARK_62_3 *
                                       poseidon2_perm_ARK_62_3 * poseidon2_perm_ARK_62_3;
    const auto poseidon2_perm_T_62_0 = poseidon2_perm_A_62_0 + poseidon2_perm_A_62_1;
    const auto poseidon2_perm_T_62_1 = poseidon2_perm_A_62_2 + poseidon2_perm_A_62_3;
    const auto poseidon2_perm_T_62_2 = FF(2) * poseidon2_perm_A_62_1 + poseidon2_perm_T_62_1;
    const auto poseidon2_perm_T_62_3 = FF(2) * poseidon2_perm_A_62_3 + poseidon2_perm_T_62_0;
    const auto poseidon2_perm_ARK_63_0 = in.get(C::poseidon2_perm_T_62_6) + poseidon2_params_C_63_0<FF>;
    const auto poseidon2_perm_ARK_63_1 = in.get(C::poseidon2_perm_T_62_5) + poseidon2_params_C_63_1<FF>;
    const auto poseidon2_perm_ARK_63_2 = in.get(C::poseidon2_perm_T_62_7) + poseidon2_params_C_63_2<FF>;
    const auto poseidon2_perm_ARK_63_3 = in.get(C::poseidon2_perm_T_62_4) + poseidon2_params_C_63_3<FF>;
    const auto poseidon2_perm_A_63_0 = poseidon2_perm_ARK_63_0 * poseidon2_perm_ARK_63_0 * poseidon2_perm_ARK_63_0 *
                                       poseidon2_perm_ARK_63_0 * poseidon2_perm_ARK_63_0;
    const auto poseidon2_perm_A_63_1 = poseidon2_perm_ARK_63_1 * poseidon2_perm_ARK_63_1 * poseidon2_perm_ARK_63_1 *
                                       poseidon2_perm_ARK_63_1 * poseidon2_perm_ARK_63_1;
    const auto poseidon2_perm_A_63_2 = poseidon2_perm_ARK_63_2 * poseidon2_perm_ARK_63_2 * poseidon2_perm_ARK_63_2 *
                                       poseidon2_perm_ARK_63_2 * poseidon2_perm_ARK_63_2;
    const auto poseidon2_perm_A_63_3 = poseidon2_perm_ARK_63_3 * poseidon2_perm_ARK_63_3 * poseidon2_perm_ARK_63_3 *
                                       poseidon2_perm_ARK_63_3 * poseidon2_perm_ARK_63_3;
    const auto poseidon2_perm_T_63_0 = poseidon2_perm_A_63_0 + poseidon2_perm_A_63_1;
    const auto poseidon2_perm_T_63_1 = poseidon2_perm_A_63_2 + poseidon2_perm_A_63_3;
    const auto poseidon2_perm_T_63_2 = FF(2) * poseidon2_perm_A_63_1 + poseidon2_perm_T_63_1;
    const auto poseidon2_perm_T_63_3 = FF(2) * poseidon2_perm_A_63_3 + poseidon2_perm_T_63_0;

    {
        using View = typename std::tuple_element_t<0, ContainerOverSubrelations>::View;
        auto tmp = static_cast<View>(in.get(C::poseidon2_perm_sel)) *
                   (FF(1) - static_cast<View>(in.get(C::poseidon2_perm_sel)));
        std::get<0>(evals) += (tmp * scaling_factor);
    }
    {
        using View = typename std::tuple_element_t<1, ContainerOverSubrelations>::View;
        auto tmp = static_cast<View>(in.get(C::poseidon2_perm_sel)) *
                   (static_cast<View>(in.get(C::poseidon2_perm_EXT_LAYER_4)) -
                    (FF(4) * CView(poseidon2_perm_EXT_LAYER_1) + CView(poseidon2_perm_EXT_LAYER_3)));
        std::get<1>(evals) += (tmp * scaling_factor);
    }
    {
        using View = typename std::tuple_element_t<2, ContainerOverSubrelations>::View;
        auto tmp = static_cast<View>(in.get(C::poseidon2_perm_sel)) *
                   (static_cast<View>(in.get(C::poseidon2_perm_EXT_LAYER_5)) -
                    (FF(4) * CView(poseidon2_perm_EXT_LAYER_0) + CView(poseidon2_perm_EXT_LAYER_2)));
        std::get<2>(evals) += (tmp * scaling_factor);
    }
    {
        using View = typename std::tuple_element_t<3, ContainerOverSubrelations>::View;
        auto tmp = static_cast<View>(in.get(C::poseidon2_perm_sel)) *
                   (static_cast<View>(in.get(C::poseidon2_perm_EXT_LAYER_6)) -
                    (CView(poseidon2_perm_EXT_LAYER_3) + static_cast<View>(in.get(C::poseidon2_perm_EXT_LAYER_5))));
        std::get<3>(evals) += (tmp * scaling_factor);
    }
    {
        using View = typename std::tuple_element_t<4, ContainerOverSubrelations>::View;
        auto tmp = static_cast<View>(in.get(C::poseidon2_perm_sel)) *
                   (static_cast<View>(in.get(C::poseidon2_perm_EXT_LAYER_7)) -
                    (CView(poseidon2_perm_EXT_LAYER_2) + static_cast<View>(in.get(C::poseidon2_perm_EXT_LAYER_4))));
        std::get<4>(evals) += (tmp * scaling_factor);
    }
    {
        using View = typename std::tuple_element_t<5, ContainerOverSubrelations>::View;
        auto tmp = static_cast<View>(in.get(C::poseidon2_perm_sel)) *
                   (static_cast<View>(in.get(C::poseidon2_perm_T_0_4)) -
                    (FF(4) * CView(poseidon2_perm_T_0_1) + CView(poseidon2_perm_T_0_3)));
        std::get<5>(evals) += (tmp * scaling_factor);
    }
    {
        using View = typename std::tuple_element_t<6, ContainerOverSubrelations>::View;
        auto tmp = static_cast<View>(in.get(C::poseidon2_perm_sel)) *
                   (static_cast<View>(in.get(C::poseidon2_perm_T_0_5)) -
                    (FF(4) * CView(poseidon2_perm_T_0_0) + CView(poseidon2_perm_T_0_2)));
        std::get<6>(evals) += (tmp * scaling_factor);
    }
    {
        using View = typename std::tuple_element_t<7, ContainerOverSubrelations>::View;
        auto tmp = static_cast<View>(in.get(C::poseidon2_perm_sel)) *
                   (static_cast<View>(in.get(C::poseidon2_perm_T_0_6)) -
                    (CView(poseidon2_perm_T_0_3) + static_cast<View>(in.get(C::poseidon2_perm_T_0_5))));
        std::get<7>(evals) += (tmp * scaling_factor);
    }
    {
        using View = typename std::tuple_element_t<8, ContainerOverSubrelations>::View;
        auto tmp = static_cast<View>(in.get(C::poseidon2_perm_sel)) *
                   (static_cast<View>(in.get(C::poseidon2_perm_T_0_7)) -
                    (CView(poseidon2_perm_T_0_2) + static_cast<View>(in.get(C::poseidon2_perm_T_0_4))));
        std::get<8>(evals) += (tmp * scaling_factor);
    }
    {
        using View = typename std::tuple_element_t<9, ContainerOverSubrelations>::View;
        auto tmp = static_cast<View>(in.get(C::poseidon2_perm_sel)) *
                   (static_cast<View>(in.get(C::poseidon2_perm_T_1_4)) -
                    (FF(4) * CView(poseidon2_perm_T_1_1) + CView(poseidon2_perm_T_1_3)));
        std::get<9>(evals) += (tmp * scaling_factor);
    }
    {
        using View = typename std::tuple_element_t<10, ContainerOverSubrelations>::View;
        auto tmp = static_cast<View>(in.get(C::poseidon2_perm_sel)) *
                   (static_cast<View>(in.get(C::poseidon2_perm_T_1_5)) -
                    (FF(4) * CView(poseidon2_perm_T_1_0) + CView(poseidon2_perm_T_1_2)));
        std::get<10>(evals) += (tmp * scaling_factor);
    }
    {
        using View = typename std::tuple_element_t<11, ContainerOverSubrelations>::View;
        auto tmp = static_cast<View>(in.get(C::poseidon2_perm_sel)) *
                   (static_cast<View>(in.get(C::poseidon2_perm_T_1_6)) -
                    (CView(poseidon2_perm_T_1_3) + static_cast<View>(in.get(C::poseidon2_perm_T_1_5))));
        std::get<11>(evals) += (tmp * scaling_factor);
    }
    {
        using View = typename std::tuple_element_t<12, ContainerOverSubrelations>::View;
        auto tmp = static_cast<View>(in.get(C::poseidon2_perm_sel)) *
                   (static_cast<View>(in.get(C::poseidon2_perm_T_1_7)) -
                    (CView(poseidon2_perm_T_1_2) + static_cast<View>(in.get(C::poseidon2_perm_T_1_4))));
        std::get<12>(evals) += (tmp * scaling_factor);
    }
    {
        using View = typename std::tuple_element_t<13, ContainerOverSubrelations>::View;
        auto tmp = static_cast<View>(in.get(C::poseidon2_perm_sel)) *
                   (static_cast<View>(in.get(C::poseidon2_perm_T_2_4)) -
                    (FF(4) * CView(poseidon2_perm_T_2_1) + CView(poseidon2_perm_T_2_3)));
        std::get<13>(evals) += (tmp * scaling_factor);
    }
    {
        using View = typename std::tuple_element_t<14, ContainerOverSubrelations>::View;
        auto tmp = static_cast<View>(in.get(C::poseidon2_perm_sel)) *
                   (static_cast<View>(in.get(C::poseidon2_perm_T_2_5)) -
                    (FF(4) * CView(poseidon2_perm_T_2_0) + CView(poseidon2_perm_T_2_2)));
        std::get<14>(evals) += (tmp * scaling_factor);
    }
    {
        using View = typename std::tuple_element_t<15, ContainerOverSubrelations>::View;
        auto tmp = static_cast<View>(in.get(C::poseidon2_perm_sel)) *
                   (static_cast<View>(in.get(C::poseidon2_perm_T_2_6)) -
                    (CView(poseidon2_perm_T_2_3) + static_cast<View>(in.get(C::poseidon2_perm_T_2_5))));
        std::get<15>(evals) += (tmp * scaling_factor);
    }
    {
        using View = typename std::tuple_element_t<16, ContainerOverSubrelations>::View;
        auto tmp = static_cast<View>(in.get(C::poseidon2_perm_sel)) *
                   (static_cast<View>(in.get(C::poseidon2_perm_T_2_7)) -
                    (CView(poseidon2_perm_T_2_2) + static_cast<View>(in.get(C::poseidon2_perm_T_2_4))));
        std::get<16>(evals) += (tmp * scaling_factor);
    }
    {
        using View = typename std::tuple_element_t<17, ContainerOverSubrelations>::View;
        auto tmp = static_cast<View>(in.get(C::poseidon2_perm_sel)) *
                   (static_cast<View>(in.get(C::poseidon2_perm_T_3_4)) -
                    (FF(4) * CView(poseidon2_perm_T_3_1) + CView(poseidon2_perm_T_3_3)));
        std::get<17>(evals) += (tmp * scaling_factor);
    }
    {
        using View = typename std::tuple_element_t<18, ContainerOverSubrelations>::View;
        auto tmp = static_cast<View>(in.get(C::poseidon2_perm_sel)) *
                   (static_cast<View>(in.get(C::poseidon2_perm_T_3_5)) -
                    (FF(4) * CView(poseidon2_perm_T_3_0) + CView(poseidon2_perm_T_3_2)));
        std::get<18>(evals) += (tmp * scaling_factor);
    }
    {
        using View = typename std::tuple_element_t<19, ContainerOverSubrelations>::View;
        auto tmp = static_cast<View>(in.get(C::poseidon2_perm_sel)) *
                   (static_cast<View>(in.get(C::poseidon2_perm_T_3_6)) -
                    (CView(poseidon2_perm_T_3_3) + static_cast<View>(in.get(C::poseidon2_perm_T_3_5))));
        std::get<19>(evals) += (tmp * scaling_factor);
    }
    {
        using View = typename std::tuple_element_t<20, ContainerOverSubrelations>::View;
        auto tmp = static_cast<View>(in.get(C::poseidon2_perm_sel)) *
                   (static_cast<View>(in.get(C::poseidon2_perm_T_3_7)) -
                    (CView(poseidon2_perm_T_3_2) + static_cast<View>(in.get(C::poseidon2_perm_T_3_4))));
        std::get<20>(evals) += (tmp * scaling_factor);
    }
    bb::constexpr_for<0, 56, 1>([&]<size_t i>() {
        constexpr size_t sub_idx = 21 + i;
        using View = typename std::tuple_element_t<sub_idx, ContainerOverSubrelations>::View;
        if constexpr (i == 0) {
            auto tmp = static_cast<View>(in.get(C::poseidon2_perm_sel)) *
                       (static_cast<View>(in.get(B_partial_cols[i])) -
                        ((CView(poseidon2_params_MU_0<FF>) + FF(1)) * CView(poseidon2_perm_ALPHA[i]) +
                         CView(poseidon2_perm_B_3_1) + CView(poseidon2_perm_B_3_2) + CView(poseidon2_perm_B_3_3)));
            std::get<sub_idx>(evals) += (tmp * scaling_factor);
        } else {
            auto tmp =
                static_cast<View>(in.get(C::poseidon2_perm_sel)) *
                (static_cast<View>(in.get(B_partial_cols[i])) -
                 ((CView(poseidon2_params_MU_0<FF>) + FF(1)) * CView(poseidon2_perm_ALPHA[i]) +
                  CView(poseidon2_perm_X[i - 1]) + CView(poseidon2_perm_Y[i - 1]) + CView(poseidon2_perm_Z[i - 1])));
            std::get<sub_idx>(evals) += (tmp * scaling_factor);
        }
    });
    {
        using View = typename std::tuple_element_t<77, ContainerOverSubrelations>::View;
        auto tmp = static_cast<View>(in.get(C::poseidon2_perm_sel)) *
                   (static_cast<View>(in.get(C::poseidon2_perm_B_59_1)) -
                    (CView(poseidon2_params_M3_11<FF>) * CView(poseidon2_perm_X[54]) + CView(poseidon2_perm_Y[54]) +
                     CView(poseidon2_perm_Z[54]) + CView(poseidon2_perm_ALPHA[55])));
        std::get<77>(evals) += (tmp * scaling_factor);
    }
    {
        using View = typename std::tuple_element_t<78, ContainerOverSubrelations>::View;
        auto tmp = static_cast<View>(in.get(C::poseidon2_perm_sel)) *
                   (static_cast<View>(in.get(C::poseidon2_perm_B_59_2)) -
                    (CView(poseidon2_perm_X[54]) + CView(poseidon2_params_M3_22<FF>) * CView(poseidon2_perm_Y[54]) +
                     CView(poseidon2_perm_Z[54]) + CView(poseidon2_perm_ALPHA[55])));
        std::get<78>(evals) += (tmp * scaling_factor);
    }
    {
        using View = typename std::tuple_element_t<79, ContainerOverSubrelations>::View;
        auto tmp =
            static_cast<View>(in.get(C::poseidon2_perm_sel)) *
            (static_cast<View>(in.get(C::poseidon2_perm_B_59_3)) -
             (CView(poseidon2_perm_X[54]) + CView(poseidon2_perm_Y[54]) +
              CView(poseidon2_params_M3_33<FF>) * CView(poseidon2_perm_Z[54]) + CView(poseidon2_perm_ALPHA[55])));
        std::get<79>(evals) += (tmp * scaling_factor);
    }
    {
        using View = typename std::tuple_element_t<80, ContainerOverSubrelations>::View;
        auto tmp = static_cast<View>(in.get(C::poseidon2_perm_sel)) *
                   (static_cast<View>(in.get(C::poseidon2_perm_T_60_4)) -
                    (FF(4) * CView(poseidon2_perm_T_60_1) + CView(poseidon2_perm_T_60_3)));
        std::get<80>(evals) += (tmp * scaling_factor);
    }
    {
        using View = typename std::tuple_element_t<81, ContainerOverSubrelations>::View;
        auto tmp = static_cast<View>(in.get(C::poseidon2_perm_sel)) *
                   (static_cast<View>(in.get(C::poseidon2_perm_T_60_5)) -
                    (FF(4) * CView(poseidon2_perm_T_60_0) + CView(poseidon2_perm_T_60_2)));
        std::get<81>(evals) += (tmp * scaling_factor);
    }
    {
        using View = typename std::tuple_element_t<82, ContainerOverSubrelations>::View;
        auto tmp = static_cast<View>(in.get(C::poseidon2_perm_sel)) *
                   (static_cast<View>(in.get(C::poseidon2_perm_T_60_6)) -
                    (CView(poseidon2_perm_T_60_3) + static_cast<View>(in.get(C::poseidon2_perm_T_60_5))));
        std::get<82>(evals) += (tmp * scaling_factor);
    }
    {
        using View = typename std::tuple_element_t<83, ContainerOverSubrelations>::View;
        auto tmp = static_cast<View>(in.get(C::poseidon2_perm_sel)) *
                   (static_cast<View>(in.get(C::poseidon2_perm_T_60_7)) -
                    (CView(poseidon2_perm_T_60_2) + static_cast<View>(in.get(C::poseidon2_perm_T_60_4))));
        std::get<83>(evals) += (tmp * scaling_factor);
    }
    {
        using View = typename std::tuple_element_t<84, ContainerOverSubrelations>::View;
        auto tmp = static_cast<View>(in.get(C::poseidon2_perm_sel)) *
                   (static_cast<View>(in.get(C::poseidon2_perm_T_61_4)) -
                    (FF(4) * CView(poseidon2_perm_T_61_1) + CView(poseidon2_perm_T_61_3)));
        std::get<84>(evals) += (tmp * scaling_factor);
    }
    {
        using View = typename std::tuple_element_t<85, ContainerOverSubrelations>::View;
        auto tmp = static_cast<View>(in.get(C::poseidon2_perm_sel)) *
                   (static_cast<View>(in.get(C::poseidon2_perm_T_61_5)) -
                    (FF(4) * CView(poseidon2_perm_T_61_0) + CView(poseidon2_perm_T_61_2)));
        std::get<85>(evals) += (tmp * scaling_factor);
    }
    {
        using View = typename std::tuple_element_t<86, ContainerOverSubrelations>::View;
        auto tmp = static_cast<View>(in.get(C::poseidon2_perm_sel)) *
                   (static_cast<View>(in.get(C::poseidon2_perm_T_61_6)) -
                    (CView(poseidon2_perm_T_61_3) + static_cast<View>(in.get(C::poseidon2_perm_T_61_5))));
        std::get<86>(evals) += (tmp * scaling_factor);
    }
    {
        using View = typename std::tuple_element_t<87, ContainerOverSubrelations>::View;
        auto tmp = static_cast<View>(in.get(C::poseidon2_perm_sel)) *
                   (static_cast<View>(in.get(C::poseidon2_perm_T_61_7)) -
                    (CView(poseidon2_perm_T_61_2) + static_cast<View>(in.get(C::poseidon2_perm_T_61_4))));
        std::get<87>(evals) += (tmp * scaling_factor);
    }
    {
        using View = typename std::tuple_element_t<88, ContainerOverSubrelations>::View;
        auto tmp = static_cast<View>(in.get(C::poseidon2_perm_sel)) *
                   (static_cast<View>(in.get(C::poseidon2_perm_T_62_4)) -
                    (FF(4) * CView(poseidon2_perm_T_62_1) + CView(poseidon2_perm_T_62_3)));
        std::get<88>(evals) += (tmp * scaling_factor);
    }
    {
        using View = typename std::tuple_element_t<89, ContainerOverSubrelations>::View;
        auto tmp = static_cast<View>(in.get(C::poseidon2_perm_sel)) *
                   (static_cast<View>(in.get(C::poseidon2_perm_T_62_5)) -
                    (FF(4) * CView(poseidon2_perm_T_62_0) + CView(poseidon2_perm_T_62_2)));
        std::get<89>(evals) += (tmp * scaling_factor);
    }
    {
        using View = typename std::tuple_element_t<90, ContainerOverSubrelations>::View;
        auto tmp = static_cast<View>(in.get(C::poseidon2_perm_sel)) *
                   (static_cast<View>(in.get(C::poseidon2_perm_T_62_6)) -
                    (CView(poseidon2_perm_T_62_3) + static_cast<View>(in.get(C::poseidon2_perm_T_62_5))));
        std::get<90>(evals) += (tmp * scaling_factor);
    }
    {
        using View = typename std::tuple_element_t<91, ContainerOverSubrelations>::View;
        auto tmp = static_cast<View>(in.get(C::poseidon2_perm_sel)) *
                   (static_cast<View>(in.get(C::poseidon2_perm_T_62_7)) -
                    (CView(poseidon2_perm_T_62_2) + static_cast<View>(in.get(C::poseidon2_perm_T_62_4))));
        std::get<91>(evals) += (tmp * scaling_factor);
    }
    {
        using View = typename std::tuple_element_t<92, ContainerOverSubrelations>::View;
        auto tmp = static_cast<View>(in.get(C::poseidon2_perm_sel)) *
                   (static_cast<View>(in.get(C::poseidon2_perm_T_63_4)) -
                    (FF(4) * CView(poseidon2_perm_T_63_1) + CView(poseidon2_perm_T_63_3)));
        std::get<92>(evals) += (tmp * scaling_factor);
    }
    {
        using View = typename std::tuple_element_t<93, ContainerOverSubrelations>::View;
        auto tmp = static_cast<View>(in.get(C::poseidon2_perm_sel)) *
                   (static_cast<View>(in.get(C::poseidon2_perm_T_63_5)) -
                    (FF(4) * CView(poseidon2_perm_T_63_0) + CView(poseidon2_perm_T_63_2)));
        std::get<93>(evals) += (tmp * scaling_factor);
    }
    {
        using View = typename std::tuple_element_t<94, ContainerOverSubrelations>::View;
        auto tmp = static_cast<View>(in.get(C::poseidon2_perm_sel)) *
                   (static_cast<View>(in.get(C::poseidon2_perm_T_63_6)) -
                    (CView(poseidon2_perm_T_63_3) + static_cast<View>(in.get(C::poseidon2_perm_T_63_5))));
        std::get<94>(evals) += (tmp * scaling_factor);
    }
    {
        using View = typename std::tuple_element_t<95, ContainerOverSubrelations>::View;
        auto tmp = static_cast<View>(in.get(C::poseidon2_perm_sel)) *
                   (static_cast<View>(in.get(C::poseidon2_perm_T_63_7)) -
                    (CView(poseidon2_perm_T_63_2) + static_cast<View>(in.get(C::poseidon2_perm_T_63_4))));
        std::get<95>(evals) += (tmp * scaling_factor);
    }
    {
        using View = typename std::tuple_element_t<96, ContainerOverSubrelations>::View;
        auto tmp =
            static_cast<View>(in.get(C::poseidon2_perm_sel)) *
            (static_cast<View>(in.get(C::poseidon2_perm_b_0)) - static_cast<View>(in.get(C::poseidon2_perm_T_63_6)));
        std::get<96>(evals) += (tmp * scaling_factor);
    }
    {
        using View = typename std::tuple_element_t<97, ContainerOverSubrelations>::View;
        auto tmp =
            static_cast<View>(in.get(C::poseidon2_perm_sel)) *
            (static_cast<View>(in.get(C::poseidon2_perm_b_1)) - static_cast<View>(in.get(C::poseidon2_perm_T_63_5)));
        std::get<97>(evals) += (tmp * scaling_factor);
    }
    {
        using View = typename std::tuple_element_t<98, ContainerOverSubrelations>::View;
        auto tmp =
            static_cast<View>(in.get(C::poseidon2_perm_sel)) *
            (static_cast<View>(in.get(C::poseidon2_perm_b_2)) - static_cast<View>(in.get(C::poseidon2_perm_T_63_7)));
        std::get<98>(evals) += (tmp * scaling_factor);
    }
    {
        using View = typename std::tuple_element_t<99, ContainerOverSubrelations>::View;
        auto tmp =
            static_cast<View>(in.get(C::poseidon2_perm_sel)) *
            (static_cast<View>(in.get(C::poseidon2_perm_b_3)) - static_cast<View>(in.get(C::poseidon2_perm_T_63_4)));
        std::get<99>(evals) += (tmp * scaling_factor);
    }
}

} // namespace bb::avm2
