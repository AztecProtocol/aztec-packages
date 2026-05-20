#pragma once

#include <string_view>

#include "barretenberg/common/bb_bench.hpp"
#include "barretenberg/relations/relation_parameters.hpp"
#include "barretenberg/relations/relation_types.hpp"
#include "barretenberg/vm2/generated/columns.hpp"

namespace bb::avm2 {

<<<<<<< HEAD
template <typename FF_> class optimized_poseidon2_permImpl {
=======
// Constant PIL aliases hoisted to namespace scope so the FF(uint256_t{…})
// Montgomery conversions are evaluated once per FF specialization rather
// than once per call of every flavor's `accumulate`.
namespace poseidon2_perm_detail {
template <typename FF>
inline const FF poseidon2_params_MU_0_v =
    FF(uint256_t{ 13071735289386612455UL, 937867514930142591UL, 338297992309721356UL, 1214967615784395659UL });
template <typename FF>
inline const FF poseidon2_params_MU_1_v =
    FF(uint256_t{ 12135856085615145995UL, 11087747206803725188UL, 92802976007797685UL, 875972510381039422UL });
template <typename FF>
inline const FF poseidon2_params_MU_2_v =
    FF(uint256_t{ 8072276821399088149UL, 12835106910674049377UL, 12882375598172350360UL, 23726925003953432UL });
template <typename FF>
inline const FF poseidon2_params_MU_3_v =
    FF(uint256_t{ 1422103134736368267UL, 5972060781611222310UL, 3327741120806881763UL, 2462344296021899375UL });
template <typename FF> inline const FF poseidon2_params_M3_11_v = poseidon2_params_MU_1_v<FF> + FF(1);
template <typename FF> inline const FF poseidon2_params_M3_22_v = poseidon2_params_MU_2_v<FF> + FF(1);
template <typename FF> inline const FF poseidon2_params_M3_33_v = poseidon2_params_MU_3_v<FF> + FF(1);
template <typename FF>
inline const FF poseidon2_params_C_0_0_v =
    FF(uint256_t{ 10018390284920759269UL, 196898842818127395UL, 5249540449481148995UL, 1853312570062057576UL });
template <typename FF>
inline const FF poseidon2_params_C_0_1_v =
    FF(uint256_t{ 12486221224710452438UL, 2372038863109147677UL, 8230667498854222355UL, 2764611904404804029UL });
template <typename FF>
inline const FF poseidon2_params_C_0_2_v =
    FF(uint256_t{ 4466505105966356650UL, 4686185096558265002UL, 16210260819355521378UL, 1844031548168280073UL });
template <typename FF>
inline const FF poseidon2_params_C_0_3_v =
    FF(uint256_t{ 15002325471271702008UL, 5581154705073500415UL, 1229208533183169201UL, 1549225070791782920UL });
template <typename FF>
inline const FF poseidon2_params_C_1_0_v =
    FF(uint256_t{ 18309653156114024706UL, 798761732958817262UL, 6904962453156279281UL, 3335412762186210716UL });
template <typename FF>
inline const FF poseidon2_params_C_1_1_v =
    FF(uint256_t{ 2824096028161810206UL, 14640933461146357672UL, 957840840567621315UL, 1024001058677493842UL });
template <typename FF>
inline const FF poseidon2_params_C_1_2_v =
    FF(uint256_t{ 14339023814126516630UL, 12239068001133297662UL, 428134084092645147UL, 2673682960814460689UL });
template <typename FF>
inline const FF poseidon2_params_C_1_3_v =
    FF(uint256_t{ 6214865908119297870UL, 17923963059035301363UL, 10985380589240272449UL, 1430464474809378870UL });
template <typename FF>
inline const FF poseidon2_params_C_2_0_v =
    FF(uint256_t{ 5109255232332580664UL, 11913027714091798733UL, 4449570166290740355UL, 864862123557185234UL });
template <typename FF>
inline const FF poseidon2_params_C_2_1_v =
    FF(uint256_t{ 2323272968957708806UL, 354488099726909104UL, 115174089281514891UL, 80808271106704719UL });
template <typename FF>
inline const FF poseidon2_params_C_2_2_v =
    FF(uint256_t{ 9646436663147525449UL, 3404572679246369876UL, 2350204275212843361UL, 1069216089054537871UL });
template <typename FF>
inline const FF poseidon2_params_C_2_3_v =
    FF(uint256_t{ 5059356740217174171UL, 4245857056683447103UL, 2426504795124362174UL, 350059533408463330UL });
template <typename FF>
inline const FF poseidon2_params_C_3_0_v =
    FF(uint256_t{ 14876286709841668328UL, 6932857857384975351UL, 7976037835777844091UL, 738350885205242785UL });
template <typename FF>
inline const FF poseidon2_params_C_3_1_v =
    FF(uint256_t{ 16522097747524989503UL, 4157368317794149558UL, 10343110624935622906UL, 2709590753056582169UL });
template <typename FF>
inline const FF poseidon2_params_C_3_2_v =
    FF(uint256_t{ 8805379462752425633UL, 8594508728147436821UL, 15629690186821248127UL, 2936193411053712582UL });
template <typename FF>
inline const FF poseidon2_params_C_3_3_v =
    FF(uint256_t{ 17046614324338172999UL, 14086280776151114414UL, 2804088968006330580UL, 728643340397380469UL });
template <typename FF>
inline const FF poseidon2_params_C_4_0_v =
    FF(uint256_t{ 12986735346000814543UL, 6140074342411686364UL, 6041575944194691717UL, 896092723329689904UL });
template <typename FF>
inline const FF poseidon2_params_C_5_0_v =
    FF(uint256_t{ 9573905030842087441UL, 12243211539080976096UL, 15287161151491266826UL, 1310836290481124728UL });
template <typename FF>
inline const FF poseidon2_params_C_6_0_v =
    FF(uint256_t{ 8865134002163281525UL, 6813849753829831047UL, 9066778847678578696UL, 2801725307463304665UL });
template <typename FF>
inline const FF poseidon2_params_C_7_0_v =
    FF(uint256_t{ 4931814869361681093UL, 13712769805002511750UL, 1776191062268299644UL, 2068661504023016414UL });
template <typename FF>
inline const FF poseidon2_params_C_8_0_v =
    FF(uint256_t{ 8161631444256445904UL, 3049786034047984668UL, 1021328518293651309UL, 2147500022207188878UL });
template <typename FF>
inline const FF poseidon2_params_C_9_0_v =
    FF(uint256_t{ 12766468767470212468UL, 926098071429114297UL, 17691598410912255471UL, 76565467953470566UL });
template <typename FF>
inline const FF poseidon2_params_C_10_0_v =
    FF(uint256_t{ 15547843034426617484UL, 13465733818561903358UL, 11157089789589945854UL, 3107062195097242290UL });
template <typename FF>
inline const FF poseidon2_params_C_11_0_v =
    FF(uint256_t{ 16908372174309343397UL, 17264932925429761530UL, 11508063480483774160UL, 2682419245684831641UL });
template <typename FF>
inline const FF poseidon2_params_C_12_0_v =
    FF(uint256_t{ 4870692136216401181UL, 17645600130793395310UL, 2758876031472241166UL, 874943362207641089UL });
template <typename FF>
inline const FF poseidon2_params_C_13_0_v =
    FF(uint256_t{ 4540479402638267003UL, 13477556963426049071UL, 6055112305493291757UL, 1810598527648098537UL });
template <typename FF>
inline const FF poseidon2_params_C_14_0_v =
    FF(uint256_t{ 7894770769272900997UL, 9595210915998428021UL, 7642295683223718917UL, 2210716392790471408UL });
template <typename FF>
inline const FF poseidon2_params_C_15_0_v =
    FF(uint256_t{ 10910178561156475899UL, 15811627963917441510UL, 16460518660187536520UL, 1698297851221778809UL });
template <typename FF>
inline const FF poseidon2_params_C_16_0_v =
    FF(uint256_t{ 7831732902708890908UL, 1464390598836302271UL, 8568564606321342514UL, 3007171090439369509UL });
template <typename FF>
inline const FF poseidon2_params_C_17_0_v =
    FF(uint256_t{ 12758232712903990792UL, 5937193763836963893UL, 4629415695575460109UL, 2476198378403296665UL });
template <typename FF>
inline const FF poseidon2_params_C_18_0_v =
    FF(uint256_t{ 16185652584871361881UL, 3161867062328690813UL, 8447947510117581907UL, 452436262606194895UL });
template <typename FF>
inline const FF poseidon2_params_C_19_0_v =
    FF(uint256_t{ 10531967515434376071UL, 5577695765815843856UL, 9164856352050088505UL, 1205339682110411496UL });
template <typename FF>
inline const FF poseidon2_params_C_20_0_v =
    FF(uint256_t{ 3898841196333713180UL, 14650521577519770525UL, 5736581618852866049UL, 1010789789328495026UL });
template <typename FF>
inline const FF poseidon2_params_C_21_0_v =
    FF(uint256_t{ 12103741763020280571UL, 14760208106156268938UL, 15246749619665902195UL, 1987439155030896717UL });
template <typename FF>
inline const FF poseidon2_params_C_22_0_v =
    FF(uint256_t{ 326429241861474059UL, 11335157279655967493UL, 16233357323017397007UL, 2124770605461456708UL });
template <typename FF>
inline const FF poseidon2_params_C_23_0_v =
    FF(uint256_t{ 13507610432344102875UL, 9765425316929074945UL, 10455054851855122687UL, 3371280263716451574UL });
template <typename FF>
inline const FF poseidon2_params_C_24_0_v =
    FF(uint256_t{ 9433430149246843174UL, 16916651192445074064UL, 12002862125451454299UL, 3293088726774108791UL });
template <typename FF>
inline const FF poseidon2_params_C_25_0_v =
    FF(uint256_t{ 15895963712096768440UL, 10975964170403460506UL, 7594578539046143282UL, 441635248990433378UL });
template <typename FF>
inline const FF poseidon2_params_C_26_0_v =
    FF(uint256_t{ 55564641555031451UL, 2316046008873247993UL, 6273091099984972305UL, 531938487375579818UL });
template <typename FF>
inline const FF poseidon2_params_C_27_0_v =
    FF(uint256_t{ 17845282940759944461UL, 6735239388814238924UL, 3181517889518583601UL, 2376846283559998361UL });
template <typename FF>
inline const FF poseidon2_params_C_28_0_v =
    FF(uint256_t{ 14097127963645492314UL, 1165420652731038559UL, 12527303660854712762UL, 2717289076364278965UL });
template <typename FF>
inline const FF poseidon2_params_C_29_0_v =
    FF(uint256_t{ 15600044695084040011UL, 255324662529267034UL, 11859356122961343981UL, 2571979992654075442UL });
template <typename FF>
inline const FF poseidon2_params_C_30_0_v =
    FF(uint256_t{ 1589817027469470176UL, 1086723465680833706UL, 6948011514366564799UL, 2482410610948543635UL });
template <typename FF>
inline const FF poseidon2_params_C_31_0_v =
    FF(uint256_t{ 6071201116374785253UL, 16554668458221199618UL, 16319484688832471879UL, 2792452762383364279UL });
template <typename FF>
inline const FF poseidon2_params_C_32_0_v =
    FF(uint256_t{ 13535048470209809113UL, 1831807297936988201UL, 16757520396573457190UL, 508291910620511162UL });
template <typename FF>
inline const FF poseidon2_params_C_33_0_v =
    FF(uint256_t{ 6946737468087619802UL, 14033399912488027565UL, 12701200401813783486UL, 1348363389498465135UL });
template <typename FF>
inline const FF poseidon2_params_C_34_0_v =
    FF(uint256_t{ 6788008051328210729UL, 13866524545426155292UL, 4317879914214157329UL, 2633928310905799638UL });
template <typename FF>
inline const FF poseidon2_params_C_35_0_v =
    FF(uint256_t{ 1183626302001490602UL, 10035686235057284266UL, 1656321729167440177UL, 1887128381037099784UL });
template <typename FF>
inline const FF poseidon2_params_C_36_0_v =
    FF(uint256_t{ 964566190254741199UL, 17650087760652370459UL, 14904592615785317921UL, 2929864473487096026UL });
template <typename FF>
inline const FF poseidon2_params_C_37_0_v =
    FF(uint256_t{ 13584300701347139198UL, 512534187550045064UL, 13489711551083721364UL, 41824696873363624UL });
template <typename FF>
inline const FF poseidon2_params_C_38_0_v =
    FF(uint256_t{ 17586611824788147557UL, 6430987250922925699UL, 9294838151373947091UL, 348446557360066429UL });
template <typename FF>
inline const FF poseidon2_params_C_39_0_v =
    FF(uint256_t{ 15025298913764434311UL, 14393211163878018166UL, 7154440178410267241UL, 3057088631006286899UL });
template <typename FF>
inline const FF poseidon2_params_C_40_0_v =
    FF(uint256_t{ 13451769229280519155UL, 17839347496757587523UL, 10553299811918798519UL, 2523373819901075642UL });
template <typename FF>
inline const FF poseidon2_params_C_41_0_v =
    FF(uint256_t{ 16267315463205810352UL, 13830706729545301172UL, 15413288900478726729UL, 287556136711008934UL });
template <typename FF>
inline const FF poseidon2_params_C_42_0_v =
    FF(uint256_t{ 4573780169675443044UL, 8758089751960064775UL, 2470295096511057988UL, 51551212240288730UL });
template <typename FF>
inline const FF poseidon2_params_C_43_0_v =
    FF(uint256_t{ 7093949836145798554UL, 12771428392262798771UL, 17021632567931004395UL, 1558106578814965657UL });
template <typename FF>
inline const FF poseidon2_params_C_44_0_v =
    FF(uint256_t{ 8205915653008540447UL, 10376314495036230740UL, 5774593793305666491UL, 2231830927015656581UL });
template <typename FF>
inline const FF poseidon2_params_C_45_0_v =
    FF(uint256_t{ 10783762484003267341UL, 10229708558604896492UL, 1831638669050696278UL, 2190429714552610800UL });
template <typename FF>
inline const FF poseidon2_params_C_46_0_v =
    FF(uint256_t{ 7310961803978392383UL, 12793746113455595394UL, 17036245927795997300UL, 3106081169494120044UL });
template <typename FF>
inline const FF poseidon2_params_C_47_0_v =
    FF(uint256_t{ 17421859032088162675UL, 7339791467855418851UL, 4622175020331968961UL, 590786792834928630UL });
template <typename FF>
inline const FF poseidon2_params_C_48_0_v =
    FF(uint256_t{ 14242884250645212438UL, 12806057845811725595UL, 7743423753614082490UL, 213381026777379804UL });
template <typename FF>
inline const FF poseidon2_params_C_49_0_v =
    FF(uint256_t{ 1110713325513004805UL, 8318407684973846516UL, 15952888485475298710UL, 1018983205230111328UL });
template <typename FF>
inline const FF poseidon2_params_C_50_0_v =
    FF(uint256_t{ 533883137631233338UL, 333001117808183237UL, 16968583542443855481UL, 329716098711096173UL });
template <typename FF>
inline const FF poseidon2_params_C_51_0_v =
    FF(uint256_t{ 4449676039486426793UL, 7760073051300251162UL, 5615103291054015906UL, 2516053143677338215UL });
template <typename FF>
inline const FF poseidon2_params_C_52_0_v =
    FF(uint256_t{ 16503526645482286870UL, 6358830762575712333UL, 12313512559299087688UL, 2716767262544184013UL });
template <typename FF>
inline const FF poseidon2_params_C_53_0_v =
    FF(uint256_t{ 5426798011730033104UL, 13085704829880126552UL, 6356732802364281819UL, 2175930396888807151UL });
template <typename FF>
inline const FF poseidon2_params_C_54_0_v =
    FF(uint256_t{ 8262282602783970021UL, 2576069526442506486UL, 14199683559983367515UL, 3432491072538425468UL });
template <typename FF>
inline const FF poseidon2_params_C_55_0_v =
    FF(uint256_t{ 14778817021916755205UL, 6110468871588391807UL, 2850248286812407967UL, 3411084787375678665UL });
template <typename FF>
inline const FF poseidon2_params_C_56_0_v =
    FF(uint256_t{ 4906200604739023933UL, 12096549814065429793UL, 5988343102643160344UL, 309820751832846301UL });
template <typename FF>
inline const FF poseidon2_params_C_57_0_v =
    FF(uint256_t{ 8709336210313678885UL, 10520000332606345601UL, 4756441214598660785UL, 2483744946546306397UL });
template <typename FF>
inline const FF poseidon2_params_C_58_0_v =
    FF(uint256_t{ 9617950371599090517UL, 6702332727289490762UL, 7078214601245292934UL, 215269160536524476UL });
template <typename FF>
inline const FF poseidon2_params_C_59_0_v =
    FF(uint256_t{ 14694170287735041964UL, 13462371741453101277UL, 7691247574208617782UL, 1078917709155142535UL });
template <typename FF>
inline const FF poseidon2_params_C_60_0_v =
    FF(uint256_t{ 17559938410729200952UL, 12326273425107991305UL, 8641129484519639030UL, 1699848340767391255UL });
template <typename FF>
inline const FF poseidon2_params_C_60_1_v =
    FF(uint256_t{ 3946956839294125797UL, 10123891284815211853UL, 3676846437799665248UL, 753827773683953838UL });
template <typename FF>
inline const FF poseidon2_params_C_60_2_v =
    FF(uint256_t{ 10815195850656127580UL, 17940782720817522247UL, 11666428030894512886UL, 2305765957929457259UL });
template <typename FF>
inline const FF poseidon2_params_C_60_3_v =
    FF(uint256_t{ 437280840171101279UL, 6885928680245806601UL, 6031863836827793624UL, 2698250255620259624UL });
template <typename FF>
inline const FF poseidon2_params_C_61_0_v =
    FF(uint256_t{ 16961604592822056794UL, 12516844188945734293UL, 2404426354458718742UL, 901141949721836097UL });
template <typename FF>
inline const FF poseidon2_params_C_61_1_v =
    FF(uint256_t{ 3152898413090790038UL, 16108523113696338432UL, 11492645026300260534UL, 1417477149741880787UL });
template <typename FF>
inline const FF poseidon2_params_C_61_2_v =
    FF(uint256_t{ 10578217394647568846UL, 6637113826221079930UL, 1364449097464563400UL, 2379869735503406314UL });
template <typename FF>
inline const FF poseidon2_params_C_61_3_v =
    FF(uint256_t{ 6332539588517624153UL, 17422837239624809585UL, 12296960536238467913UL, 2434905421004621494UL });
template <typename FF>
inline const FF poseidon2_params_C_62_0_v =
    FF(uint256_t{ 10311634121439582299UL, 2959376558854333994UL, 6697398963915560134UL, 417944321386245900UL });
template <typename FF>
inline const FF poseidon2_params_C_62_1_v =
    FF(uint256_t{ 16872849857899172004UL, 1640712307042701286UL, 16457516735210998920UL, 1084862449077757478UL });
template <typename FF>
inline const FF poseidon2_params_C_62_2_v =
    FF(uint256_t{ 10329879351081882815UL, 5178010365334480003UL, 7014208314719145622UL, 385149140585498380UL });
template <typename FF>
inline const FF poseidon2_params_C_62_3_v =
    FF(uint256_t{ 13199866221884806229UL, 10541991787372042848UL, 14909749656931548440UL, 708152185224876794UL });
template <typename FF>
inline const FF poseidon2_params_C_63_0_v =
    FF(uint256_t{ 1717216310632203061UL, 17455832130858697862UL, 5278085098799702411UL, 227655898188482835UL });
template <typename FF>
inline const FF poseidon2_params_C_63_1_v =
    FF(uint256_t{ 17164141620747686731UL, 16689913387728553544UL, 2568326884589391367UL, 3166155980659486882UL });
template <typename FF>
inline const FF poseidon2_params_C_63_2_v =
    FF(uint256_t{ 1233442753680249567UL, 15490006495937952898UL, 7249042245074469654UL, 2138985910652398451UL });
template <typename FF>
inline const FF poseidon2_params_C_63_3_v =
    FF(uint256_t{ 4115849303762846724UL, 2230284817967990783UL, 5095423606777193313UL, 1685862792723606183UL });
} // namespace poseidon2_perm_detail

template <typename FF_> class poseidon2_permImpl {
>>>>>>> 3660127702 (fix(avm): hoist constexpr pol alias to new namespace)
  public:
    using FF = FF_;

    static constexpr std::array<size_t, 100> SUBRELATION_PARTIAL_LENGTHS = {
        3, 3, 3, 3, 3, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7,
        7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7,
        7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 3, 3, 3, 3
    };

    template <typename AllEntities> inline static bool skip(const AllEntities& in)
    {
        using C = ColumnAndShifts;
        return (in.get(C::poseidon2_perm_sel)).is_zero();
    }

    template <typename ContainerOverSubrelations, typename AllEntities>
    void static accumulate(ContainerOverSubrelations& evals,
                           const AllEntities& in,
                           [[maybe_unused]] const RelationParameters<FF>&,
                           [[maybe_unused]] const FF& scaling_factor);
};

template <typename FF> class optimized_poseidon2_perm : public Relation<optimized_poseidon2_permImpl<FF>> {
  public:
    static constexpr const std::string_view NAME = "poseidon2_perm";

    static std::string get_subrelation_label(size_t index) { return std::to_string(index); }
};

} // namespace bb::avm2
