/* Deezer Music Plugin for Lampa
   Proxy: https://recycleactor-deezer.hf.space
   Decrypts Blowfish CBC stream in-browser via MediaSource API
   Login: ARL-token stored in Lampa.Storage */
(function(){
'use strict';

/* ─── Config ──────────────────────────────────────────────────────────────── */
var PROXY   = 'https://recycleactor-deezer.hf.space';
var DEEZER  = 'https://api.deezer.com';
var SECRET  = 'g4el58wc0zvf9na1';
var SKEY    = 'deezer_arl';           // Storage key for ARL token
var SKEY_QUAL = 'deezer_quality';
var SKEY_OAUTH = 'deezer_oauth';
var SKEY_RECENT = 'deezer_recent_tracks';

var _dz_si = {};
function _dzStr(v){
    if(v === null || v === undefined) return '';
    if(typeof v === 'string') return v;
    if(typeof v === 'number') return String(v);
    return '';
}
function _dzSGet(key, def){
    var v;
    try { v = Lampa.Storage.get(key, def); } catch (e) { v = def; }
    if(v === undefined) v = def;
    return _dzStr(v);
}
function _dzSGetTrim(key, def){
    return _dzSGet(key, def).trim();
}
function getRecentTracks(){
    try {
        var raw = Lampa.Storage.get(SKEY_RECENT, '');
        if (!raw) return [];
        var v = JSON.parse(raw);
        return Array.isArray(v) ? v : [];
    } catch (e) { return []; }
}
function setRecentTracks(list){
    try { Lampa.Storage.set(SKEY_RECENT, JSON.stringify(list || [])); } catch (e) {}
}
function addRecentTrack(t){
    if(!t || !t.id) return;
    var album = t.album || {};
    var artist = t.artist || {};
    var item = {
        id: t.id,
        title: t.title || '',
        duration: t.duration || t.DURATION || 0,
        preview: t.preview,
        artist: { name: artist.name || '' },
        album: {
            title: album.title || '',
            cover_small: album.cover_small || '',
            cover_medium: album.cover_medium || album.cover_big || album.cover_xl || '',
            cover_big: album.cover_big || album.cover_xl || album.cover_medium || '',
            cover_xl: album.cover_xl || album.cover_big || album.cover_medium || ''
        }
    };
    var list = getRecentTracks();
    list = list.filter(function(x){ return x && x.id && String(x.id) !== String(item.id); });
    list.unshift(item);
    if (list.length > 24) list.length = 24;
    setRecentTracks(list);
}
function fmtBytes(n){
    n = parseInt(n||0,10) || 0;
    if(!n) return '';
    var u=['B','KB','MB','GB','TB'];
    var i=0;
    while(n>=1024&&i<u.length-1){n=n/1024;i++;}
    return (i===0?String(Math.round(n)):String(n.toFixed(n<10?2:(n<100?1:0))))+' '+u[i];
}
function siKey(t){
    if(!t||!t.id) return '';
    return String(t.id)+'_'+String(getQuality());
}
function fetchStreamInfo(t){
    if(!PROXY||!t||!t.id) return;
    var key = siKey(t); if(!key) return;
    var now = Date.now();
    var c = _dz_si[key];
    if(c && c.ts && (now - c.ts) < 5*60*1000) return;
    _dz_si[key] = { ts: now, pending: true };
    proxyGet('/stream_info?id=' + encodeURIComponent(t.id) + '&format=' + encodeURIComponent(getQuality()), function(r){
        _dz_si[key] = { ts: Date.now(), data: r || null };
    }, function(){
        _dz_si[key] = { ts: Date.now(), data: null };
    });
}
function getStreamInfo(t){
    var key = siKey(t); if(!key) return null;
    var c = _dz_si[key];
    return c && c.data ? c.data : null;
}

function getQuality() {
    var q = _dzSGetTrim(SKEY_QUAL, '');
    if (!q) q = 'AUTO';
    if (q !== 'AUTO' && q !== 'MP3_128' && q !== 'MP3_320' && q !== 'FLAC') q = 'AUTO';
    return q;
}
function qualityLabel(q) {
    if (q === 'FLAC') return 'FLAC';
    if (q === 'MP3_320') return 'MP3 320';
    if (q === 'MP3_128') return 'MP3 128';
    return 'AUTO';
}
function qualityLabelShort(q) {
    if (q === 'FLAC') return 'FLAC';
    if (q === 'MP3_320') return '320';
    if (q === 'MP3_128') return '128';
    return 'AUTO';
}

/* ─── Blowfish P-array (pi digits) ───────────────────────────────────────── */
var BFP=[0x243F6A88,0x85A308D3,0x13198A2E,0x03707344,0xA4093822,0x299F31D0,
         0x082EFA98,0xEC4E6C89,0x452821E6,0x38D01377,0xBE5466CF,0x34E90C6C,
         0xC0AC29B7,0xC97C50DD,0x3F84D5B5,0xB5470917,0x9216D5D9,0x8979FB1B];

/* ─── Blowfish S0 ─────────────────────────────────────────────────────────── */
var BFS0=[0xD1310BA6,0x98DFB5AC,0x2FFD72DB,0xD01ADFB7,0xB8E1AFED,0x6A267E96,0xBA7C9045,0xF12C7F99,
0x24A19947,0xB3916CF7,0x0801F2E2,0x858EFC16,0x636920D8,0x71574E69,0xA458FEA3,0xF4933D7E,
0x0D95748F,0x728EB658,0x718BCD58,0x82154AEE,0x7B54A41D,0xC25A59B5,0x9C30D539,0x2AF26013,
0xC5D1B023,0x286085F0,0xCA417918,0xB8DB38EF,0x8E79DCB0,0x603A180E,0x6C9E0E8B,0xB01E8A3E,
0xD71577C1,0xBD314B27,0x78AF2FDA,0x55605C60,0xE65525F3,0xAA55AB94,0x57489862,0x63E81440,
0x55CA396A,0x2AAB10B6,0xB4CC5C34,0x1141E8CE,0xA15486AF,0x7C72E993,0xB3EE1411,0x636FBC2A,
0x2BA9C55D,0x741831F6,0xCE5C3E16,0x9B87931E,0xAFD6BA33,0x6C24CF5C,0x7A325381,0x28958677,
0x3B8F4898,0x6B4BB9AF,0xC4BFE81B,0x66282193,0x61D809CC,0xFB21A991,0x487CAC60,0x5DEC8032,
0xEF845D5D,0xE98575B1,0xDC262302,0xEB651B88,0x23893E81,0xD396ACC5,0x0F6D6FF3,0x83F44239,
0x2E0B4482,0xA4842004,0x69C8F04A,0x9E1F9B5E,0x21C66842,0xF6E96C9A,0x670C9C61,0xABD388F0,
0x6A51A0D2,0xD8542F68,0x960FA728,0xAB5133A3,0x6EEF0B6C,0x137A3BE4,0xBA3BF050,0x7EFB2A98,
0xA1F1651D,0x39AF0176,0x66CA593E,0x82430E88,0x8CEE8619,0x456F9FB4,0x7D84A5C3,0x3B8B5EBE,
0xE06F75D8,0x85C12073,0x401A449F,0x56C16AA6,0x4ED3AA62,0x363F7706,0x1BFEDF72,0x429B023D,
0x37D0D724,0xD00A1248,0xDB0FEAD3,0x49F1C09B,0x075372C9,0x80991B7B,0x25D479D8,0xF6E8DEF7,
0xE3FE501A,0xB6794C3B,0x976CE0BD,0x04C006BA,0xC1A94FB6,0x409F60C4,0x5E5C9EC2,0x196A2463,
0x68FB6FAF,0x3E6C53B5,0x1339B2EB,0x3B52EC6F,0x6DFC511F,0x9B30952C,0xCC814544,0xAF5EBD09,
0xBEE3D004,0xDE334AFD,0x660F2807,0x192E4BB3,0xC0CBA857,0x45C8740F,0xD20B5F39,0xB9D3FBDB,
0x5579C0BD,0x1A60320A,0xD6A100C6,0x402C7279,0x679F25FE,0xFB1FA3CC,0x8EA5E9F8,0xDB3222F8,
0x3C7516DF,0xFD616B15,0x2F501EC8,0xAD0552AB,0x323DB5FA,0xFD238760,0x53317B48,0x3E00DF82,
0x9E5C57BB,0xCA6F8CA0,0x1A87562E,0xDF1769DB,0xD542A8F6,0x287EFFC3,0xAC6732C6,0x8C4F5573,
0x695B27B0,0xBBCA58C8,0xE1FFA35D,0xB8F011A0,0x10FA3D98,0xFD2183B8,0x4AFCB56C,0x2DD1D35B,
0x9A53E479,0xB6F84565,0xD28E49BC,0x4BFB9790,0xE1DDF2DA,0xA4CB7E33,0x62FB1341,0xCEE4C6E8,
0xEF20CADA,0x36774C01,0xD07E9EFE,0x2BF11FB4,0x95DBDA4D,0xAE909198,0xEAAD8E71,0x6B93D5A0,
0xD08ED1D0,0xAFC725E0,0x8E3C5B2F,0x8E7594B7,0x8FF6E2FB,0xF2122B64,0x8888B812,0x900DF01C,
0x4FAD5EA0,0x688FC31C,0xD1CFF191,0xB3A8C1AD,0x2F2F2218,0xBE0E1777,0xEA752DFE,0x8B021FA1,
0xE5A0CC0F,0xB56F74E8,0x18ACF3D6,0xCE89E299,0xB4A84FE0,0xFD13E0B7,0x7CC43B81,0xD2ADA8D9,
0x165FA266,0x80957705,0x93CC7314,0x211A1477,0xE6AD2065,0x77B5FA86,0xC75442F5,0xFB9D35CF,
0xEBCDAF0C,0x7B3E89A0,0xD6411BD3,0xAE1E7E49,0x00250E2D,0x2071B35E,0x226800BB,0x57B8E0AF,
0x2464369B,0xF009B91E,0x5563911D,0x59DFA6AA,0x78C14389,0xD95A537F,0x207D5BA2,0x02E5B9C5,
0x83260376,0x6295CFA9,0x11C81968,0x4E734A41,0xB3472DCA,0x7B14A94A,0x1B510052,0x9A532915,
0xD60F573F,0xBC9BC6E4,0x2B60A476,0x81E67400,0x08BA6FB5,0x571BE91F,0xF296EC6B,0x2A0DD915,
0xB6636521,0xE7B9F9B6,0xFF34052E,0xC5855664,0x53B02D5D,0xA99F8FA1,0x08BA4799,0x6E85076A];
/* ─── Blowfish S1 ─────────────────────────────────────────────────────────── */
var BFS1=[0x4B7A70E9,0xB5B32944,0xDB75092E,0xC4192623,0xAD6EA6B0,0x49A7DF7D,0x9CEE60B8,0x8FEDB266,
0xECAA8C71,0x699A17FF,0x5664526C,0xC2B19EE1,0x193602A5,0x75094C29,0xA0591340,0xE4183A3E,
0x3F54989A,0x5B429D65,0x6B8FE4D6,0x99F73FD6,0xA1D29C07,0xEFE830F5,0x4D2D38E6,0xF0255DC1,
0x4CDD2086,0x8470EB26,0x6382E9C6,0x021ECC5E,0x09686B3F,0x3EBAEFC9,0x3C971814,0x6B6A70A1,
0x687F3584,0x52A0E286,0xB79C5305,0xAA500737,0x3E07841C,0x7FDEAE5C,0x8E7D44EC,0x5716F2B8,
0xB03ADA37,0xF0500C0D,0xF01C1F04,0x0200B3FF,0xAE0CF51A,0x3CB574B2,0x25837A58,0xDC0921BD,
0xD19113F9,0x7CA92FF6,0x94324773,0x22F54701,0x3AE5E581,0x37C2DADC,0xC8B57634,0x9AF3DDA7,
0xA9446146,0x0FD0030E,0xECC8C73E,0xA4751E41,0xE238CD99,0x3BEA0E2F,0x3280BBA1,0x183EB331,
0x4E548B38,0x4F6DB908,0x6F420D03,0xF60A04BF,0x2CB81290,0x24977C79,0x5679B072,0xBCAF89AF,
0xDE9A771F,0xD9930810,0xB38BAE12,0xDCCF3F2E,0x5512721F,0x2E6B7124,0x501ADDE6,0x9F84CD87,
0x7A584718,0x7408DA17,0xBC9F9ABC,0xE94B7D8C,0xEC7AEC3A,0xDB851DFA,0x63094366,0xC464C3D2,
0xEF1C1847,0x3215D908,0xDD433B37,0x24C2BA16,0x12A14D43,0x2A65C451,0x50940002,0x133AE4DD,
0x71DFF89E,0x10314E55,0x81AC77D6,0x5F11199B,0x043556F1,0xD7A3C76B,0x3C11183B,0x5924A509,
0xF28FE6ED,0x97F1FBFA,0x9EBABF2C,0x1E153C6E,0x86E34570,0xEAE96FB1,0x860E5E0A,0x5A3E2AB3,
0x771FE71C,0x4E3D06FA,0x2965DCB9,0x99E71D0F,0x803E89D6,0x5266C825,0x2E4CC978,0x9C10B36A,
0xC6150EBA,0x94E2EA78,0xA5FC3C53,0x1E0A2DF4,0xF2F74EA7,0x361D2B3D,0x1939260F,0x19C27960,
0x5223A708,0xF71312B6,0xEBADFE6E,0xEAC31F66,0xE3BC4595,0xA67BC883,0xB17F37D1,0x018CFF28,
0xC332DDEF,0xBE6C5AA5,0x65582185,0x68AB9802,0xEECEA50F,0xDB2F953B,0x2AEF7DAD,0x5B6E2F84,
0x1521B628,0x29076170,0xECDD4775,0x619F1510,0x13CCA830,0xEB61BD96,0x0334FE1E,0xAA0363CF,
0xB5735C90,0x4C70A239,0xD59E9E0B,0xCBAADE14,0xEECC86BC,0x60622CA7,0x9CAB5CAB,0xB2F3846E,
0x648B1EAF,0x19BDF0CA,0xA02369B9,0x655ABB50,0x40685A32,0x3C2AB4B3,0x319EE9D5,0xC021B8F7,
0x9B540B19,0x875FA099,0x95F7997E,0x623D7DA8,0xF837889A,0x97E32D77,0x11ED935F,0x16681281,
0x0E358829,0xC7E61FD6,0x96DEDFA1,0x7858BA99,0x57F584A5,0x1B227263,0x9B83C3FF,0x1AC24696,
0xCDB30AEB,0x532E3054,0x8FD948E4,0x6DBC3128,0x58EBF2EF,0x34C6FFEA,0xFE28ED61,0xEE7C3C73,
0x5D4A14D9,0xE864B7E3,0x42105D14,0x203E13E0,0x45EEE2B6,0xA3AAABEA,0xDB6C4F15,0xFACB4FD0,
0xC742F442,0xEF6ABBB5,0x654F3B1D,0x41CD2105,0xD81E799E,0x86854DC7,0xE44B476A,0x3D816250,
0xCF62A1F2,0x5B8D2646,0xFC8883A0,0xC1C7B6A3,0x7F1524C3,0x69CB7492,0x47848A0B,0x5692B285,
0x095BBF00,0xAD19489D,0x1462B174,0x23820E00,0x58428D2A,0x0C55F5EA,0x1DADF43E,0x233F7061,
0x3372F092,0x8D937E41,0xD65FECF1,0x6C223BDB,0x7CDE3759,0xCBEE7460,0x4085F2A7,0xCE77326E,
0xA6078084,0x19F8509E,0xE8EFD855,0x61D99735,0xA969A7AA,0xC50C06C2,0x5A04ABFC,0x800BCADC,
0x9E447A2E,0xC3453484,0xFDD56705,0x0E1E9EC9,0xDB73DBD3,0x105588CD,0x675FDA79,0xE3674340,
0xC5C43465,0x713E38D8,0x3D28F89E,0xF16DFF20,0x153E21E7,0x8FB03D4A,0xE6E39F2B,0xDB83ADF7];
/* ─── Blowfish S2 ─────────────────────────────────────────────────────────── */
var BFS2=[0xE93D5A68,0x948140F7,0xF64C261C,0x94692934,0x411520F7,0x7602D4F7,0xBCF46B2E,0xD4A20068,
0xD4082471,0x3320F46A,0x43B7D4B7,0x500061AF,0x1E39F62E,0x97244546,0x14214F74,0xBF8B8840,
0x4D95FC1D,0x96B591AF,0x70F4DDD3,0x66A02F45,0xBFBC09EC,0x03BD9785,0x7FAC6DD0,0x31CB8504,
0x96EB27B3,0x55FD3941,0xDA2547E6,0xABCA0A9A,0x28507825,0x530429F4,0x0A2C86DA,0xE9B66DFB,
0x68DC1462,0xD7486900,0x680EC0A4,0x27A18DEE,0x4F3FFEA2,0xE887AD8C,0xB58CE006,0x7AF4D6B6,
0xAACE1E7C,0xD3375FEC,0xCE78A399,0x406B2A42,0x20FE9E35,0xD9F385B9,0xEE39D7AB,0x3B124E8B,
0x1DC9FAF7,0x4B6D1856,0x26A36631,0xEAE397B2,0x3A6EFA74,0xDD5B4332,0x6841E7F7,0xCA7820FB,
0xFB0AF54E,0xD8FEB397,0x454056AC,0xBA489527,0x55533A3A,0x20838D87,0xFE6BA9B7,0xD096954B,
0x55A867BC,0xA1159A58,0xCCA92963,0x99E1DB33,0xA62A4A56,0x3F3125F9,0x5EF47E1C,0x9029317C,
0xFDF8E802,0x04272F70,0x80BB155C,0x05282CE3,0x95C11548,0xE4C66D22,0x48C1133F,0xC70F86DC,
0x07F9C9EE,0x41041F0F,0x404779A4,0x5D886E17,0x325F51EB,0xD59BC0D1,0xF2BCC18F,0x41113564,
0x257B7834,0x602A9C60,0xDFF8E8A3,0x1F636C1B,0x0E12B4C2,0x02E1329E,0xAF664FD1,0xCAD18115,
0x6B2395E0,0x333E92E1,0x3B240B62,0xEEBEB922,0x85B2A20E,0xE6BA0D99,0xDE720C8C,0x2DA2F728,
0xD0127845,0x95B794FD,0x647D0862,0xE7CCF5F0,0x5449A36F,0x877D48FA,0xC39DFD27,0xF33E8D1E,
0x0A476341,0x992EFF74,0x3A6F6EAB,0xF4F8FD37,0xA812DC60,0xA1EBDDF8,0x991BE14C,0xDB6E6B0D,
0xC67B5510,0x6D672C37,0x2765D43B,0xDCD0E804,0xF1290DC7,0xCC00FFA3,0xB5390F92,0x690FED0B,
0x667B9FFB,0xCEDB7D9C,0xA091CF0B,0xD9155EA3,0xBB132F88,0x515BAD24,0x7B9479BF,0x763BD6EB,
0x37392EB3,0xCC115979,0x8026E297,0xF42E312D,0x6842ADA7,0xC66A2B3B,0x12754CCC,0x782EF11C,
0x6A124237,0xB79251E7,0x06A1BBE6,0x4BFB6350,0x1A6B1018,0x11CAEDFA,0x3D25BDD8,0xE2E1C3C9,
0x44421659,0x0A121386,0xD90CEC6E,0xD5ABEA2A,0x64AF674E,0xDA86A85F,0xBEBFE988,0x64E4C3FE,
0x9DBC8057,0xF0F7C086,0x60787BF8,0x6003604D,0xD1FD8346,0xF6381FB0,0x7745AE04,0xD736FCCC,
0x83426B33,0xF01EAB71,0xB0804187,0x3C005E5F,0x77A057BE,0xBDE8AE24,0x55464299,0xBF582E61,
0x4E58F48F,0xF2DDFDA2,0xF474EF38,0x8789BDC2,0x5366F9C3,0xC8B38E74,0xB475F255,0x46FCD9B9,
0x7AEB2661,0x8B1DDF84,0x846A0E79,0x915F95E2,0x466E598E,0x20B45770,0x8CD55591,0xC902DE4C,
0xB90BACE1,0xBB8205D0,0x11A86248,0x7574A99E,0xB77F19B6,0xE0A9DC09,0x662D09A1,0xC4324633,
0xE85A1F02,0x09F0BE8C,0x4A99A025,0x1D6EFE10,0x1AB93D1D,0x0BA5A4DF,0xA186F20F,0x2868F169,
0xDCB7DA83,0x573906FE,0xA1E2CE9B,0x4FCD7F52,0x50115E01,0xA70683FA,0xA002B5C4,0x0DE6D027,
0x9AF88C27,0x773F8641,0xC3604C06,0x61A806B5,0xF0177A28,0xC0F586E0,0x006058AA,0x30DC7D62,
0x11E69ED7,0x2338EA63,0x53C2DD94,0xC2C21634,0xBBCBEE56,0x90BCB6DE,0xEBFC7DA1,0xCE591D76,
0x6F05E409,0x4B7C0188,0x39720A3D,0x7C927C24,0x86E3725F,0x724D9DB9,0x1AC15BB4,0xD39EB8FC,
0xED545578,0x08FCA5B5,0xD83D7CD3,0x4DAD0FC4,0x1E50EF5E,0xB161E6F8,0xA28514D9,0x6C51133C,
0x6FD5C7E7,0x56E14EC4,0x362ABFCE,0xDDC6C837,0xD79A3234,0x92638212,0x670EFA8E,0x406000E0];
/* ─── Blowfish S3 ─────────────────────────────────────────────────────────── */
var BFS3=[0x3A39CE37,0xD3FAF5CF,0xABC27737,0x5AC52D1B,0x5CB0679E,0x4FA33742,0xD3822740,0x99BC9BBE,
0xD5118E9D,0xBF0F7315,0xD62D1C7E,0xC700C47B,0xB78C1B6B,0x21A19045,0xB26EB1BE,0x6A366EB4,
0x5748AB2F,0xBC946E79,0xC6A376D2,0x6549C2C8,0x530FF8EE,0x468DDE7D,0xD5730A1D,0x4CD04DC6,
0x2939BBDB,0xA9BA4650,0xAC9526E8,0xBE5EE304,0xA1FAD5F0,0x6A2D519A,0x63EF8CE2,0x9A86EE22,
0xC089C2B8,0x43242EF6,0xA51E03AA,0x9CF2D0A4,0x83C061BA,0x9BE96A4D,0x8FE51550,0xBA645BD6,
0x2826A2F9,0xA73A3AE1,0x4BA99586,0xEF5562E9,0xC72FEFD3,0xF752F7DA,0x3F046F69,0x77FA0A59,
0x80E4A915,0x87B08601,0x9B09E6AD,0x3B3EE593,0xE990FD5A,0x9E34D797,0x2CF0B7D9,0x022B8B51,
0x96D5AC3A,0x017DA67D,0xD1CF3ED6,0x7C7D2D28,0x1F9F25CF,0xADF2B89B,0x5AD6B472,0x5A88F54C,
0xE029AC71,0xE019A5E6,0x47B0ACFD,0xED93FA9B,0xE8D3C48D,0x283B57CC,0xF8D56629,0x79132E28,
0x785F0191,0xED756055,0xF7960E44,0xE3D35E8C,0x15056DD4,0x88F46DBA,0x03A16125,0x0564F0BD,
0xC3EB9E15,0x3C9057A2,0x97271AEC,0xA93A072A,0x1B3F6D9B,0x1E6321F5,0xF59C66FB,0x26DCF319,
0x7533D928,0xB155FDF5,0x03563482,0x8ABA3CBB,0x28517711,0xC20AD9F8,0xABCC5167,0xCCAD925F,
0x4DE81751,0x3830DC8E,0x379D5862,0x9320F991,0xEA7A90C2,0xFB3E7BCE,0x5121CE64,0x774FBE32,
0xA8B6E37E,0xC3293D46,0x48DE5369,0x6413E680,0xA2AE0810,0xDD6DB224,0x69852DFD,0x09072166,
0xB39A460A,0x6445C0DD,0x586CDECF,0x1C20C8AE,0x5BBEF7DD,0x1B588D40,0xCCD2017F,0x6BB4E3BB,
0xDDA26A7E,0x3A59FF45,0x3E350A44,0xBCB4CDD5,0x72EACEA8,0xFA6484BB,0x8D6612AE,0xBF3C6F47,
0xD29BE463,0x542F5D9E,0xAEC2771B,0xF64E6370,0x740E0D8D,0xE75B1357,0xF8721671,0xAF537D5D,
0x4040CB08,0x4EB4E2CC,0x34D2466A,0x0115AF84,0xE1B00428,0x95983A1D,0x06B89FB4,0xCE6EA048,
0x6F3F3B82,0x3520AB82,0x011A1D4B,0x277227F8,0x611560B1,0xE7933FDC,0xBB3A792B,0x344525BD,
0xA08839E1,0x51CE794B,0x2F32C9B7,0xA01FBAC9,0xE01CC87E,0xBCC7D1F6,0xCF0111C3,0xA1E8AAC7,
0x1A908749,0xD44FBD9A,0xD0DADECB,0xD50ADA38,0x0339C32A,0xC6913667,0x8DF9317C,0xE0B12B4F,
0xF79E59B7,0x43F5BB3A,0xF2D519FF,0x27D9459C,0xBF97222C,0x15E6FC2A,0x0F91FC71,0x9B941525,
0xFAE59361,0xCEB69CEB,0xC2A86459,0x12BAA8D1,0xB6C1075E,0xE3056A0C,0x10D25065,0xCB03A442,
0xE0EC6E0E,0x1698DB3B,0x4C98A0BE,0x3278E964,0x9F1F9532,0xE0D392DF,0xD3A0342B,0x8971F21E,
0x1B0A7441,0x4BA3348C,0xC5BE7120,0xC37632D8,0xDF359F8D,0x9B992F2E,0xE60B6F47,0x0FE3F11D,
0xE54CDA54,0x1DAD4CE9,0xD4DBA84C,0x3E1B2E95,0x87AA31DC,0x27B5E6EA,0x0ABD8F46,0x17D0A83B,
0xC74B6A71,0x58DC9B2F,0x5AF3C578,0xEDFC7D23,0x7F979498,0xE9A6AB4A,0x83B58C71,0xE1D2B7EA,
0xC51AEBB0,0xA5D7A9B4,0xB4B5BBA0,0xD22B7C0E,0x2B6B4EA8,0x79BD2E44,0x4EA2AEA5,0x6D7218A1,
0x0E7EF66F,0x78CC00B6,0xDE5EB8AF,0x3D93BFBE,0xE9B60CE7,0x7CC870A4,0xD7EF8B04,0x5F18B5F6,
0x28BCDCD6,0x0BF23E97,0x1C1FBD0E,0x3CEC59B7,0x96432A0E,0x0406A42B,0xD7E5BC0E,0x77F60FA3,
0xA4E1E8B2,0x1D371A88,0x365C1AEB,0x87A9CB84,0xE0EDE4E8,0x0EF2DB2B,0x6CCC75EE,0x5573DD97,
0xEEB1A67C,0xDFD73D33,0xEB38E96A,0xDD09EE4A,0x02C91E2C,0x2D14CE8C,0x5E8B3AB7,0x23161CDB];

/* ─── Blowfish engine ─────────────────────────────────────────────────────── */
function bfEnc(lr,p,s0,s1,s2,s3){
    var l=lr[0],r=lr[1],t,f;
    for(var i=0;i<16;i++){
        l=(l^p[i])>>>0;
        f=(((s0[(l>>>24)&0xFF]+s1[(l>>>16)&0xFF])>>>0)^s2[(l>>>8)&0xFF])>>>0;
        f=(f+s3[l&0xFF])>>>0;
        r=(r^f)>>>0;
        t=l;l=r;r=t;
    }
    t=l;l=r;r=t;
    lr[0]=(r^p[16])>>>0; lr[1]=(l^p[17])>>>0;
}
function bfDec(lr,p,s0,s1,s2,s3){
    var l=lr[0],r=lr[1],t,f;
    for(var i=17;i>1;i--){
        l=(l^p[i])>>>0;
        f=(((s0[(l>>>24)&0xFF]+s1[(l>>>16)&0xFF])>>>0)^s2[(l>>>8)&0xFF])>>>0;
        f=(f+s3[l&0xFF])>>>0;
        r=(r^f)>>>0;
        t=l;l=r;r=t;
    }
    t=l;l=r;r=t;
    lr[0]=(r^p[1])>>>0; lr[1]=(l^p[0])>>>0;
}
function bfKey(keyStr){
    var kb=[],i,k,b;
    for(i=0;i<keyStr.length;i++) kb.push(keyStr.charCodeAt(i)&0xFF);
    var p=BFP.slice(),s0=BFS0.slice(),s1=BFS1.slice(),s2=BFS2.slice(),s3=BFS3.slice();
    var j=0;
    for(i=0;i<18;i++){var d=0;for(k=0;k<4;k++){d=((d<<8)|kb[j%kb.length])>>>0;j++;}p[i]=(p[i]^d)>>>0;}
    var lr=[0,0];
    for(i=0;i<18;i+=2){bfEnc(lr,p,s0,s1,s2,s3);p[i]=lr[0];p[i+1]=lr[1];}
    for(b=0;b<256;b+=2){bfEnc(lr,p,s0,s1,s2,s3);s0[b]=lr[0];s0[b+1]=lr[1];}
    for(b=0;b<256;b+=2){bfEnc(lr,p,s0,s1,s2,s3);s1[b]=lr[0];s1[b+1]=lr[1];}
    for(b=0;b<256;b+=2){bfEnc(lr,p,s0,s1,s2,s3);s2[b]=lr[0];s2[b+1]=lr[1];}
    for(b=0;b<256;b+=2){bfEnc(lr,p,s0,s1,s2,s3);s3[b]=lr[0];s3[b+1]=lr[1];}
    return {p:p,s0:s0,s1:s1,s2:s2,s3:s3};
}
function bfDecChunk(data,ctx){
    var out=new Uint8Array(data.length),ivL=0x00010203,ivR=0x04050607,lr=[0,0],off,cL,cR,pL,pR;
    for(off=0;off<data.length;off+=8){
        cL=(data[off]<<24|data[off+1]<<16|data[off+2]<<8|data[off+3])>>>0;
        cR=(data[off+4]<<24|data[off+5]<<16|data[off+6]<<8|data[off+7])>>>0;
        lr[0]=cL;lr[1]=cR;
        bfDec(lr,ctx.p,ctx.s0,ctx.s1,ctx.s2,ctx.s3);
        pL=(lr[0]^ivL)>>>0;pR=(lr[1]^ivR)>>>0;
        ivL=cL;ivR=cR;
        out[off]=(pL>>>24)&0xFF;out[off+1]=(pL>>>16)&0xFF;out[off+2]=(pL>>>8)&0xFF;out[off+3]=pL&0xFF;
        out[off+4]=(pR>>>24)&0xFF;out[off+5]=(pR>>>16)&0xFF;out[off+6]=(pR>>>8)&0xFF;out[off+7]=pR&0xFF;
    }
    return out;
}

/* ─── MD5 (little-endian) ────────────────────────────────────────────────── */
function md5hex(str){
    function R(n,c){return(n<<c)|(n>>>(32-c));}
    function a32(a,b){return(a+b)|0;}
    function ff(a,b,c,d,x,s,t){return a32(R(a32(a32(a,(b&c)|(~b&d)),a32(x,t)),s),b);}
    function gg(a,b,c,d,x,s,t){return a32(R(a32(a32(a,(b&d)|(c&~d)),a32(x,t)),s),b);}
    function hh(a,b,c,d,x,s,t){return a32(R(a32(a32(a,b^c^d),     a32(x,t)),s),b);}
    function ii(a,b,c,d,x,s,t){return a32(R(a32(a32(a,c^(b|~d)),  a32(x,t)),s),b);}
    var n=str.length,M=[],i;
    for(i=0;i<n;i++) M[i>>2]=(M[i>>2]||0)|(str.charCodeAt(i)&0xFF)<<((i%4)*8);
    M[n>>2]=(M[n>>2]||0)|(0x80<<((n%4)*8));
    M[(((n+8)>>6)<<4)+14]=n*8;
    var a=0x67452301,b=0xEFCDAB89,c=0x98BADCFE,d=0x10325476,aa,bb,cc,dd,X;
    for(i=0;i<M.length;i+=16){
        X=M.slice(i,i+16);while(X.length<16)X.push(0);
        aa=a;bb=b;cc=c;dd=d;
        a=ff(a,b,c,d,X[0], 7,-680876936); d=ff(d,a,b,c,X[1],12,-389564586); c=ff(c,d,a,b,X[2],17,606105819); b=ff(b,c,d,a,X[3],22,-1044525330);
        a=ff(a,b,c,d,X[4], 7,-176418897); d=ff(d,a,b,c,X[5],12,1200080426); c=ff(c,d,a,b,X[6],17,-1473231341);b=ff(b,c,d,a,X[7],22,-45705983);
        a=ff(a,b,c,d,X[8], 7,1770035416);d=ff(d,a,b,c,X[9],12,-1958414417);c=ff(c,d,a,b,X[10],17,-42063);b=ff(b,c,d,a,X[11],22,-1990404162);
        a=ff(a,b,c,d,X[12],7,1804603682);d=ff(d,a,b,c,X[13],12,-40341101);c=ff(c,d,a,b,X[14],17,-1502002290);b=ff(b,c,d,a,X[15],22,1236535329);
        a=gg(a,b,c,d,X[1], 5,-165796510); d=gg(d,a,b,c,X[6], 9,-1069501632);c=gg(c,d,a,b,X[11],14,643717713);b=gg(b,c,d,a,X[0],20,-373897302);
        a=gg(a,b,c,d,X[5], 5,-701558691); d=gg(d,a,b,c,X[10],9,38016083);c=gg(c,d,a,b,X[15],14,-660478335);b=gg(b,c,d,a,X[4],20,-405537848);
        a=gg(a,b,c,d,X[9], 5,568446438);d=gg(d,a,b,c,X[14],9,-1019803690);c=gg(c,d,a,b,X[3],14,-187363961);b=gg(b,c,d,a,X[8],20,1163531501);
        a=gg(a,b,c,d,X[13],5,-1444681467);d=gg(d,a,b,c,X[2],9,-51403784);c=gg(c,d,a,b,X[7],14,1735328473);b=gg(b,c,d,a,X[12],20,-1926607734);
        a=hh(a,b,c,d,X[5], 4,-378558);d=hh(d,a,b,c,X[8],11,-2022574463);c=hh(c,d,a,b,X[11],16,1839030562);b=hh(b,c,d,a,X[14],23,-35309556);
        a=hh(a,b,c,d,X[1], 4,-1530992060);d=hh(d,a,b,c,X[4],11,1272893353);c=hh(c,d,a,b,X[7],16,-155497632);b=hh(b,c,d,a,X[10],23,-1094730640);
        a=hh(a,b,c,d,X[13],4,681279174);d=hh(d,a,b,c,X[0],11,-358537222);c=hh(c,d,a,b,X[3],16,-722521979);b=hh(b,c,d,a,X[6],23,76029189);
        a=hh(a,b,c,d,X[9], 4,-640364487);d=hh(d,a,b,c,X[12],11,-421815835);c=hh(c,d,a,b,X[15],16,530742520);b=hh(b,c,d,a,X[2],23,-995338651);
        a=ii(a,b,c,d,X[0], 6,-198630844);d=ii(d,a,b,c,X[7],10,1126891415);c=ii(c,d,a,b,X[14],15,-1416354905);b=ii(b,c,d,a,X[5],21,-57434055);
        a=ii(a,b,c,d,X[12],6,1700485571);d=ii(d,a,b,c,X[3],10,-1894986606);c=ii(c,d,a,b,X[10],15,-1051523);b=ii(b,c,d,a,X[1],21,-2054922799);
        a=ii(a,b,c,d,X[8], 6,1873313359);d=ii(d,a,b,c,X[15],10,-30611744);c=ii(c,d,a,b,X[6],15,-1560198380);b=ii(b,c,d,a,X[13],21,1309151649);
        a=ii(a,b,c,d,X[4], 6,-145523070);d=ii(d,a,b,c,X[11],10,-1120210379);c=ii(c,d,a,b,X[2],15,718787259);b=ii(b,c,d,a,X[9],21,-343485551);
        a=a32(a,aa);b=a32(b,bb);c=a32(c,cc);d=a32(d,dd);
    }
    function le(n){var s='';for(var j=0;j<4;j++)s+=('0'+((n>>>(j*8))&0xFF).toString(16)).slice(-2);return s;}
    return le(a)+le(b)+le(c)+le(d);
}
function trackKey(id){
    var h=md5hex(String(id)),k='',i;
    for(i=0;i<16;i++) k+=String.fromCharCode(h.charCodeAt(i)^h.charCodeAt(i+16)^SECRET.charCodeAt(i));
    return k;
}

/* ─── Stream: decrypt → Blob URL ─────────────────────────────────────────── */
function streamDeezer(trackId, cdnUrl, audioEl, onErr) {
    var BLOCK = 2048;
    var ctx   = bfKey(trackKey(trackId));

    function sig(u8) {
        var n = Math.min(16, u8.length), hx = [], as = '', i, b;
        for (i = 0; i < n; i++) {
            b = u8[i];
            hx.push(('0' + b.toString(16)).slice(-2));
            as += (b >= 32 && b <= 126) ? String.fromCharCode(b) : '.';
        }
        return hx.join(' ') + ' | ' + as;
    }

    function looksMp3(u8) {
        if (!u8 || u8.length < 4) return false;
        if (u8[0] === 0x49 && u8[1] === 0x44 && u8[2] === 0x33) return true; // ID3
        if (u8[0] === 0xFF && (u8[1] & 0xE0) === 0xE0) return true; // frame sync
        return false;
    }

    function decode(buffer) {
        try {
            var raw = new Uint8Array(buffer);
            if (raw.length < 2048) { onErr('Empty response from CDN (' + raw.length + ' bytes)'); return; }
            var data = raw;

            if (!looksMp3(raw)) {
                var out = new Uint8Array(raw.length);
                var bi  = 0;
                for (var off = 0; off < raw.length; off += BLOCK, bi++) {
                    var end   = Math.min(off + BLOCK, raw.length);
                    var chunk = raw.subarray(off, end);
                    if (bi % 3 === 0 && chunk.length === BLOCK) out.set(bfDecChunk(chunk, ctx), off);
                    else out.set(chunk, off);
                }
                data = out;
            }

            if (!looksMp3(data)) {
                onErr('Bad audio data (' + raw.length + ' bytes) sig=' + sig(data) + ' raw=' + sig(raw));
                return;
            }

            var blob    = new Blob([data], { type: 'audio/mpeg' });
            var blobUrl = URL.createObjectURL(blob);
            if (audioEl._dz_blob) { try { URL.revokeObjectURL(audioEl._dz_blob); } catch(e){} }
            audioEl._dz_blob = blobUrl;
            audioEl.src = blobUrl;
            try { audioEl.load(); } catch (e) {}
        } catch (e) {
            onErr('Decrypt: ' + e.message);
        }
    }

    function xhrLoad(url) {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', url, true);
        xhr.responseType = 'arraybuffer';
        xhr.timeout = 60000;
        xhr.onload = function () {
            if (xhr.status < 200 || xhr.status >= 300) { onErr('CDN HTTP ' + xhr.status); return; }
            decode(xhr.response);
        };
        xhr.onerror   = function () { onErr('XHR network error (possible CORS block)'); };
        xhr.ontimeout = function () { onErr('XHR timeout'); };
        xhr.send();
    }

    function fetchLoad(url) {
        fetch(url)
            .then(function (r) {
                if (!r.ok) throw new Error('CDN HTTP ' + r.status);
                return r.arrayBuffer();
            })
            .then(function (buf) { if (buf) decode(buf); else onErr('Empty response'); })
            .catch(function (e) {
                console.warn('[DZ] fetch failed, trying XHR:', e && e.message ? e.message : e);
                xhrLoad(url);
            });
    }
    
    if (window.fetch) fetchLoad(cdnUrl);
    else xhrLoad(cdnUrl);
}

/* ─── Network helpers ────────────────────────────────────────────────────── */
function apiGet(path,params,cb,err){
    var url=DEEZER+path+'?output=json';
    if(params)for(var k in params)url+='&'+k+'='+encodeURIComponent(params[k]);
    var x=new XMLHttpRequest(); x.open('GET',url,true); x.timeout=15000;
    x.onload=function(){try{cb(JSON.parse(x.responseText));}catch(e){if(err)err(e);}};
    x.onerror=x.ontimeout=function(e){if(err)err(e);}; x.send();
}
function getStreamUrl(id,cb,err){
    var x=new XMLHttpRequest(); x.open('POST',PROXY+'/get_url',true);
    x.setRequestHeader('Content-Type','application/json'); x.timeout=15000;
    x.onload=function(){
        try{
            var j=JSON.parse(x.responseText);
            var url=j.data&&j.data[0]&&j.data[0].media&&j.data[0].media[0]&&
                    j.data[0].media[0].sources&&j.data[0].media[0].sources[0]&&
                    j.data[0].media[0].sources[0].url;
            if(url)cb(url);else if(err)err('no url in response: '+x.responseText.slice(0,200));
        }catch(e){if(err)err(e);}
    };
    x.onerror=x.ontimeout=function(e){if(err)err(e);};
    x.send(JSON.stringify({formats:['MP3_128'],ids:[parseInt(id,10)]}));
}
function proxyPost(path, data, cb, err) {
    if (!PROXY) { if (err) err('no proxy'); return; }
    var x = new XMLHttpRequest();
    x.open('POST', PROXY + path, true);
    x.setRequestHeader('Content-Type', 'application/json');
    x.timeout = 15000;
    x.onload = function () {
        var parsed = null;
        try { parsed = JSON.parse(x.responseText); }
        catch (e) {
            if (err) err('http ' + x.status + ': ' + (x.responseText || '').slice(0, 160));
            return;
        }
        if (x.status >= 200 && x.status < 300) {
            if (cb) cb(parsed);
        } else {
            if (err) err((parsed && parsed.error) ? parsed.error : ('http ' + x.status));
        }
    };
    x.onerror = x.ontimeout = function () { if (err) err('network'); };
    x.send(JSON.stringify(data || {}));
}
function proxyGet(path, cb, err) {
    if (!PROXY) { if (err) err('no proxy'); return; }
    var x = new XMLHttpRequest();
    x.open('GET', PROXY + path, true);
    x.timeout = 15000;
    x.onload = function () {
        var parsed = null;
        try { parsed = JSON.parse(x.responseText); }
        catch (e) {
            if (err) err('http ' + x.status + ': ' + (x.responseText || '').slice(0, 160));
            return;
        }
        if (x.status >= 200 && x.status < 300) {
            if (cb) cb(parsed);
        } else {
            if (err) err((parsed && parsed.error) ? parsed.error : ('http ' + x.status));
        }
    };
    x.onerror = x.ontimeout = function () { if (err) err('network'); };
    x.send();
}
function s2t(s){s=s|0;return Math.floor(s/60)+':'+(s%60<10?'0':'')+(s%60);}
function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function dzBar(){return document.getElementById('dz-bar');}

/* ─── Player head button ─────────────────────────────────────────────────── */
var _dzHeadBtn = null;
function showHeadBtn(show) {
    if (show && !_dzHeadBtn) {
        var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" style="width:1.3em;height:1.3em"><path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z"/></svg>';
        _dzHeadBtn = Lampa.Head.addIcon(svg, function () {
            if (window.DZPlayerOverlay && DZPlayerOverlay.open) DZPlayerOverlay.open();
            else Lampa.Activity.push({ component: 'deezer_player_screen', title: 'Плеер' });
        });
        _dzHeadBtn.addClass('dz-head-btn');
    }
    if (_dzHeadBtn) _dzHeadBtn.toggleClass('hide', !show);
}

/* ─── Player ─────────────────────────────────────────────────────────────── */
var DZPlayer=(function(){
    var au=null,queue=[],qi=0;
    function getAu(){
        if(!au){au=document.createElement('audio');au.id='dz-au';au.style.display='none';document.body.appendChild(au);}
        return au;
    }
    function barEl(){return document.getElementById('dz-bar');}
    function initBar() {
        if (barEl()) return;
        var el = document.createElement('div'); el.id = 'dz-bar';
        el.innerHTML =
            '<div id="dz-prog-w"><div id="dz-prog"></div></div>' +
            '<div id="dz-cov"></div>' +
            '<div id="dz-info"><div id="dz-ttl"></div><div id="dz-art"></div></div>' +
            '<div id="dz-btns">' +
            '<button class="dz-b selector" id="dz-ctrl">⏸ Управление</button>' +
            '</div>';
        document.body.appendChild(el);
        try { Lampa.Controller.collectionAppend($(el).find('.selector')); } catch (e) {}
        // Clicking the control button opens a Select menu (works with remote)
        $(el).find('#dz-ctrl').on('click hover:enter', function () {
            var isPaused = au && au.paused;
            Lampa.Select.show({
                title: 'Deezer — плеер',
                items: [
                    { title: '\u{1F3B5} Открыть плеер',                  action: 'full' },
                    { title: isPaused ? '▶ Продолжить' : '⏸ Пауза',  action: 'pp' },
                    { title: '⏮ Предыдущий трек',                    action: 'prev' },
                    { title: '⏭ Следующий трек',                     action: 'next' },
                    { title: '🎚 Качество: ' + qualityLabel(getQuality()), action: 'qual' },
                    { title: '⏹ Остановить',                         action: 'stop' }
                ],
                onSelect: function (item) {
                    if (item.action === 'full') {
                        try { if (window.DZPlayerOverlay && DZPlayerOverlay.open) DZPlayerOverlay.open(); } catch (e) {}
                    }
                    if (item.action === 'pp')   pub.toggle();
                    if (item.action === 'prev') pub.prev();
                    if (item.action === 'next') pub.next();
                    if (item.action === 'qual') {
                        var cur = getQuality();
                        Lampa.Select.show({
                            title: 'Deezer — качество',
                            items: [
                                { title: (cur === 'AUTO' ? '✓ ' : '') + 'AUTO',    value: 'AUTO' },
                                { title: (cur === 'FLAC' ? '✓ ' : '') + 'FLAC',    value: 'FLAC' },
                                { title: (cur === 'MP3_320' ? '✓ ' : '') + 'MP3 320', value: 'MP3_320' },
                                { title: (cur === 'MP3_128' ? '✓ ' : '') + 'MP3 128', value: 'MP3_128' }
                            ],
                            onSelect: function (it) {
                                pub.setQuality(it.value);
                            },
                            onBack: function () {}
                        });
                    }
                    if (item.action === 'stop') pub.stop();
                },
                onBack: function () {}
            });
        });
    }
    function syncBar(t) {
        initBar();
        var bar = barEl();
        bar.style.display = 'flex';
        var tt = document.getElementById('dz-ttl'),
            at = document.getElementById('dz-art'),
            cv = document.getElementById('dz-cov');
        if (tt) tt.textContent = t.title || '';
        if (at) at.textContent = ((t.artist && t.artist.name) || '') + ' · ' + qualityLabelShort(getQuality());
        if (cv) cv.style.backgroundImage = (t.album && t.album.cover_small) ? 'url(' + t.album.cover_small + ')' : 'none';
        syncState();
        showHeadBtn(true);
        addRecentTrack(t);
        if (pub.onTrackChange) try { pub.onTrackChange(t, qi); } catch(e){}
    }
    function syncState() {
        var btn = document.getElementById('dz-ctrl');
        if (btn && au) btn.textContent = au.paused ? '▶ Управление' : '⏸ Управление';
    }
    function playTrack(t, seekTo) {
        var el = getAu();
        el.oncanplay = null;
        el.onerror = null;
        el.onended = null;
        el.ontimeupdate = null;
        try { el.pause(); } catch (e) {}
        if (el._dz_blob) { try { URL.revokeObjectURL(el._dz_blob); } catch (e) {} el._dz_blob = null; }
        try { el.removeAttribute('src'); } catch (e) { el.src = ''; }
        try { el.load(); } catch (e) {}
        Lampa.Noty.show('\u{1F3B5} ' + (t.title || '...'));
        function playPreview() {
            if (t && t.preview) {
                try {
                    if (el._dz_blob) { try { URL.revokeObjectURL(el._dz_blob); } catch (e2) {} el._dz_blob = null; }
                    el.src = t.preview;
                    el.load();
                    el.play().catch(function () {});
                    syncBar(t);
                    Lampa.Noty.show('Deezer: превью (30с)');
                } catch (e3) {}
            } else {
                Lampa.Noty.show('Deezer: нет аудио');
            }
        }

        el.oncanplay = function () {
            el.oncanplay = null;
            if (typeof seekTo === 'number' && seekTo > 0 && isFinite(seekTo)) {
                try { el.currentTime = seekTo; } catch (e) {}
            }
            el.play().catch(function (e) { console.warn('[DZ play]', e); });
            syncBar(t);
        };
        el.onerror = function () {
            console.error('[DZ audio error]', el.error);
            // Стрим упал — пробуем получить preview через публичный API
            if (t && t.id && !t._preview_tried) {
                t._preview_tried = true;
                var xhr = new XMLHttpRequest();
                xhr.open('GET', DEEZER + '/track/' + encodeURIComponent(t.id) + '?output=json', true);
                xhr.timeout = 8000;
                xhr.onload = function () {
                    try {
                        var data = JSON.parse(xhr.responseText);
                        if (data && data.preview) {
                            t.preview = data.preview;
                        }
                    } catch(e2) {}
                    playPreview();
                };
                xhr.onerror = xhr.ontimeout = function () { playPreview(); };
                xhr.send();
            } else {
                playPreview();
            }
        };
        el.onended = function () { pub.next(); };
        el.ontimeupdate = function () {
            var p = document.getElementById('dz-prog');
            if (p && el.duration) p.style.width = (el.currentTime / el.duration * 100) + '%';
        };

        if (!PROXY) {
            playPreview();
            return;
        }

        var arl = _dzSGetTrim(SKEY, '');
        var oauth = _dzSGetTrim(SKEY_OAUTH, '');

        var fmt = getQuality();
        el.src = PROXY + '/stream?id=' + encodeURIComponent(t.id) + '&format=' + encodeURIComponent(fmt) + (arl ? ('&arl=' + encodeURIComponent(arl)) : '');
        el.load();
    }
    var pub={
        play:function(t,q,i){queue=q||[t];qi=(typeof i==='number')?i:0;playTrack(queue[qi]);},
        next:function(){if(qi<queue.length-1){qi++;playTrack(queue[qi]);}else pub.stop();},
        prev:function(){if(qi>0){qi--;playTrack(queue[qi]);}},
        seekTo:function(sec){
            if(!isFinite(sec)||sec<0) return;
            if(!au) return;
            var t = queue[qi]; if(!t) return;
            var dur = (au && au.duration && isFinite(au.duration) && au.duration > 0)
                ? au.duration
                : (parseInt(t.duration || t.DURATION || 0, 10) || 0);
            if (dur > 0) {
                if (sec > dur) sec = dur - 0.1;
                if (sec < 0) sec = 0;
            }
            try {
                if (typeof au.fastSeek === 'function') au.fastSeek(sec);
                else au.currentTime = sec;
            } catch (e) {}
            syncBar(t);
        },
        current:function(){ return queue[qi]||null; },
        getQueue:function(){ return queue.slice(); },
        getQueueIndex:function(){ return qi; },
        getProgress:function(){
            var t = queue[qi] || null;
            var cur = au ? (au.currentTime || 0) : 0;
            var dur = 0;
            if (au && au.duration && isFinite(au.duration) && au.duration > 0) dur = au.duration;
            else if (t) dur = parseInt(t.duration || t.DURATION || 0, 10) || 0;
            if (dur > 0 && cur > dur) cur = dur;
            return {current:cur, duration:dur, pct:(dur>0?(cur/dur):0), seekable:!!dur};
        },
        isPaused:function(){ return !au||au.paused; },
        setQuality:function(q){
            if (q !== 'AUTO' && q !== 'MP3_128' && q !== 'MP3_320' && q !== 'FLAC') q = 'AUTO';
            Lampa.Storage.set(SKEY_QUAL, q);
            if (queue && queue.length && queue[qi]) {
                var t = queue[qi];
                var pos = au ? au.currentTime : 0;
                playTrack(t, pos);
                Lampa.Noty.show('Deezer: качество ' + qualityLabel(q));
            }
            syncState();
        },
        toggle:function(){if(!au)return;au.paused?au.play():au.pause();syncState();},
        stop:function(){
            if(au){
                try{ au.pause(); }catch(e){}
                try{ au.removeAttribute('src'); }catch(e){ au.src=''; }
                try{ au.load(); }catch(e){}
            }
            var b=barEl();if(b)b.style.display='none';
            showHeadBtn(false);
        },
        onTrackChange: null   // callback(track, index) set by PlayerScreen
    };
    return pub;
}());

/* ─── Fullscreen Player Overlay ──────────────────────────────────────────── */
var DZPlayerOverlay = (function () {
    var _open      = false;
    var _tick      = null;
    var _showQueue = false;
    var _root      = null;
    var _wrap      = null;

    function fmt(sec) { return s2t(sec | 0); }
    function stopTick() { if (_tick) { clearInterval(_tick); _tick = null; } }

    /* ── Фокус ── */
    function getSelectors() {
        if (!_wrap) return [];
        return Array.prototype.slice.call(_wrap.querySelectorAll('.selector'));
    }
    function getFocused() {
        if (!_wrap) return null;
        var items = getSelectors();
        for (var i = 0; i < items.length; i++) {
            if ($(items[i]).hasClass('focus') || $(items[i]).hasClass('focused')) return items[i];
        }
        if (document.activeElement && _wrap.contains(document.activeElement)) return document.activeElement;
        return null;
    }
    function focusEl(el) {
        if (!el || !_wrap) return;
        Lampa.Controller.collectionSet($(_wrap), false);
        Lampa.Controller.collectionFocus(el, $(_wrap));
        try { el.scrollIntoView({ block: 'nearest' }); } catch(e) {}
    }
    function focusPreferred() {
        if (!_wrap) return;
        var target = _wrap.querySelector('.dzps-pp') || _wrap.querySelector('#dzps-bg') || _wrap.querySelector('.selector');
        if (target) focusEl(target);
    }
    function refocus() {
        if (!_wrap) return;
        Lampa.Controller.collectionSet($(_wrap), false);
        setTimeout(function () { focusPreferred(); }, 30);
    }

    function render() {
        if (!_wrap) return;
        var t      = DZPlayer.current();
        var q      = DZPlayer.getQueue();
        var curIdx = DZPlayer.getQueueIndex();
        var prog   = DZPlayer.getProgress();
        var paused = DZPlayer.isPaused();
        var cover  = (t && t.album && (t.album.cover_xl || t.album.cover_big || t.album.cover_medium)) || '';

        _wrap.innerHTML = '';

        var shell = document.createElement('div');
        shell.className = 'dzps-shell' + (_showQueue ? ' dzps-shell--queue' : '');

        // Левая: обложка
        var coverEl = document.createElement('div');
        coverEl.className = 'dzps-cover';
        if (cover) coverEl.style.backgroundImage = 'url(' + esc(cover) + ')';
        shell.appendChild(coverEl);

        // Центр: инфо + прогресс + кнопки
        var center = document.createElement('div');
        center.className = 'dzps-center';

        center.innerHTML =
            '<div class="dzps-trackinfo">' +
              '<div class="dzps-title" id="dzps-title">' + esc((t && t.title) || 'Ничего не играет') + '</div>' +
              '<div class="dzps-artist" id="dzps-artist">' + esc((t && t.artist && t.artist.name) || '') + '</div>' +
            '</div>' +
            '<div class="dzps-prog">' +
              '<span class="dzps-time" id="dzps-cur">' + fmt(prog.current) + '</span>' +
              '<div class="dzps-bar-wrap selector" id="dzps-bg" tabindex="0">' +
                '<div class="dzps-bar-track">' +
                  '<div class="dzps-bar-fill" id="dzps-fill" style="width:' + (prog.pct * 100).toFixed(1) + '%"></div>' +
                  '<div class="dzps-bar-knob" id="dzps-knob" style="left:' + (prog.pct * 100).toFixed(1) + '%"></div>' +
                '</div>' +
              '</div>' +
              '<span class="dzps-time dzps-time--r" id="dzps-dur">' + (prog.seekable ? fmt(prog.duration) : '--:--') + '</span>' +
            '</div>';

        // Кнопки
        function mkBtn(svgPath, cls, action) {
            var b = document.createElement('div');
            b.className = 'dzps-btn selector ' + (cls || '');
            b.tabIndex = 0;
            b.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor">' + svgPath + '</svg>';
            var busy = false;
            function fire() { if (busy) return; busy = true; setTimeout(function(){busy=false;},300); action(); }
            b.addEventListener('click', fire);
            $(b).on('hover:enter', fire);
            return b;
        }

        var ctrl = document.createElement('div');
        ctrl.className = 'dzps-ctrl';

        var prevBtn = mkBtn('<path d="M6 6h2v12H6zm3.5 6 8.5 6V6z"/>', 'dzps-btn--side', function(){ DZPlayer.prev(); });
        var ppBtn   = mkBtn(
            paused ? '<path d="M8 5v14l11-7z"/>' : '<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>',
            'dzps-btn--play dzps-pp', function(){
                DZPlayer.toggle();
                ppBtn.querySelector('svg').innerHTML = DZPlayer.isPaused()
                    ? '<path d="M8 5v14l11-7z"/>'
                    : '<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>';
            });
        var nextBtn  = mkBtn('<path d="M6 18l8.5-6L6 6v12zm2.5-6 5.5 3.9V8.1L8.5 12zM16 6h2v12h-2z"/>', 'dzps-btn--side', function(){ DZPlayer.next(); });
        var queueBtn = mkBtn('<path d="M4 6h16v2H4zm0 5h16v2H4zm0 5h16v2H4z"/>', 'dzps-btn--queue' + (_showQueue ? ' dzps-btn--active' : ''), function(){
            _showQueue = !_showQueue;
            render(); startTick(); refocus();
        });

        ctrl.appendChild(prevBtn);
        ctrl.appendChild(ppBtn);
        ctrl.appendChild(nextBtn);
        ctrl.appendChild(queueBtn);
        center.appendChild(ctrl);

        var metaEl = document.createElement('div');
        metaEl.className = 'dzps-meta';
        metaEl.id = 'dzps-meta';
        center.appendChild(metaEl);

        shell.appendChild(center);

        // Правая панель очереди
        if (_showQueue) {
            var qCol = document.createElement('div');
            qCol.className = 'dzps-qcol';
            qCol.innerHTML = '<div class="dzps-qhead">Очередь</div>';
            var qList = document.createElement('div');
            qList.className = 'dzps-qlist';
            if (q.length) {
                q.forEach(function(item, idx) {
                    var row = document.createElement('div');
                    row.className = 'dzps-qitem selector' + (idx === curIdx ? ' dzps-qitem--now' : '');
                    row.tabIndex = 0;
                    var cov = (item.album && item.album.cover_small) || '';
                    row.innerHTML =
                        '<div class="dzps-qthumb"' + (cov ? ' style="background-image:url(' + esc(cov) + ')"' : '') + '></div>' +
                        '<div class="dzps-qtext">' +
                          '<div class="dzps-qname">' + esc(item.title || '') + '</div>' +
                          '<div class="dzps-qsub">' + esc((item.artist && item.artist.name) || '') + '</div>' +
                        '</div>' +
                        '<div class="dzps-qdur">' + s2t(item.duration || 0) + '</div>';
                    (function(_i){
                        var busy = false;
                        function go(){ if(busy)return;busy=true;setTimeout(function(){busy=false;},300);DZPlayer.play(q[_i],q,_i); }
                        row.addEventListener('click', go);
                        $(row).on('hover:enter', go);
                        $(row).on('hover:focus', function(){ try{row.scrollIntoView({block:'nearest'});}catch(e){} });
                    })(idx);
                    qList.appendChild(row);
                });
                setTimeout(function(){
                    var a=qList.querySelector('.dzps-qitem--now');
                    if(a) try{a.scrollIntoView({block:'center'});}catch(e){}
                }, 60);
            } else {
                qList.innerHTML = '<div class="dzps-qempty">Очередь пустая</div>';
            }
            qCol.appendChild(qList);
            shell.appendChild(qCol);
        }

        _wrap.appendChild(shell);

        if (_root) {
            if (cover) _root.style.setProperty('--dz-bg', 'url(' + esc(cover) + ')');
            else _root.style.removeProperty('--dz-bg');
        }
    }

    function startTick() {
        stopTick();
        _tick = setInterval(function () {
            if (!_wrap || !_open) return;
            var t = DZPlayer.current(); if (!t) return;
            var prog   = DZPlayer.getProgress();
            var fill   = _wrap.querySelector('#dzps-fill');
            var knob   = _wrap.querySelector('#dzps-knob');
            var cur    = _wrap.querySelector('#dzps-cur');
            var dur    = _wrap.querySelector('#dzps-dur');
            var pp     = _wrap.querySelector('.dzps-pp');
            var bg     = _wrap.querySelector('#dzps-bg');
            var metaEl = _wrap.querySelector('#dzps-meta');
            if (fill)  fill.style.width = prog.seekable ? (prog.pct*100).toFixed(1)+'%' : '0%';
            if (knob)  knob.style.left  = prog.seekable ? (prog.pct*100).toFixed(1)+'%' : '0%';
            if (cur)   cur.textContent  = fmt(prog.current);
            if (dur)   dur.textContent  = prog.seekable ? fmt(prog.duration) : '--:--';
            if (pp)    try { pp.querySelector('svg').innerHTML = DZPlayer.isPaused()
                ? '<path d="M8 5v14l11-7z"/>'
                : '<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>'; } catch(e){}
            if (bg)    bg.style.opacity = prog.seekable ? '1' : '0.4';
            if (metaEl) {
                fetchStreamInfo(t);
                var si    = getStreamInfo(t);
                var reqQ  = qualityLabel(getQuality());
                var usedQ = (si && si.used) ? String(si.used) : '';
                var parts = [usedQ ? (reqQ + ' → ' + usedQ) : reqQ];
                if (si && si.bitrate_kbps) parts.push(si.bitrate_kbps + ' kbps');
                if (si && si.bytes)        parts.push(fmtBytes(si.bytes));
                metaEl.textContent = parts.join(' · ');
            }
        }, 500);
    }

    function ensureController() {
        if (DZPlayerOverlay._ctrlAdded) return;
        DZPlayerOverlay._ctrlAdded = true;
        Lampa.Controller.add('deezer_player', {
            invisible: true,
            toggle: function () {
                if (_wrap) { Lampa.Controller.collectionSet($(_wrap), false); focusPreferred(); }
            },
            up: function () {
                var items = getSelectors(), cur = getFocused(), idx = items.indexOf(cur);
                if (idx > 0) focusEl(items[idx - 1]);
            },
            down: function () {
                var items = getSelectors(), cur = getFocused(), idx = items.indexOf(cur);
                if (idx >= 0 && idx < items.length - 1) focusEl(items[idx + 1]);
            },
            left: function () {
                var cur = getFocused();
                if (cur && cur.id === 'dzps-bg') {
                    DZPlayer.seekTo(Math.max(0, (DZPlayer.getProgress().current || 0) - 10));
                    return;
                }
                var items = getSelectors(), idx = items.indexOf(cur);
                if (idx > 0) focusEl(items[idx - 1]);
            },
            right: function () {
                var cur = getFocused();
                if (cur && cur.id === 'dzps-bg') {
                    DZPlayer.seekTo((DZPlayer.getProgress().current || 0) + 10);
                    return;
                }
                var items = getSelectors(), idx = items.indexOf(cur);
                if (idx >= 0 && idx < items.length - 1) focusEl(items[idx + 1]);
            },
            back: function () { DZPlayerOverlay.close(); }
        });
    }

    function bindSeek() {
        $(_wrap).on('click.dzsek', function(e) {
            var bg = _wrap && _wrap.querySelector('#dzps-bg');
            if (!bg) return;
            var tgt = e.target;
            if (tgt !== bg && !bg.contains(tgt)) return;
            var pr = DZPlayer.getProgress();
            if (!pr.duration || pr.duration <= 0) return;
            var rect = bg.getBoundingClientRect();
            DZPlayer.seekTo(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) * pr.duration);
        });
    }

    function open() {
        if (_open) { render(); startTick(); refocus(); return; }
        injectCSS();
        ensureController();
        _open = true; _showQueue = false;
        var bar = document.getElementById('dz-bar');
        if (bar) bar.style.display = 'none';
        _root = document.createElement('div');
        _root.id = 'dzps-overlay'; _root.className = 'dzps-overlay';
        _wrap = document.createElement('div'); _wrap.className = 'dzps-wrap';
        _root.appendChild(_wrap); document.body.appendChild(_root);
        bindSeek();
        render();
        DZPlayer.onTrackChange = function () { render(); startTick(); refocus(); };
        startTick();
        setTimeout(function () { Lampa.Controller.toggle('deezer_player'); }, 50);
    }

    function _doClose() {
        _open = false; stopTick(); DZPlayer.onTrackChange = null;
        try { if (_root && _root.parentNode) _root.parentNode.removeChild(_root); } catch(e) {}
        _root = null; _wrap = null;
        var bar = document.getElementById('dz-bar');
        if (bar && DZPlayer.current()) bar.style.display = 'flex';
    }

    function close() {
        if (!_open) return; _doClose();
        try {
            var act = Lampa.Activity.active();
            if (act && act.component === 'deezer_player_screen') Lampa.Activity.backward();
            else Lampa.Controller.toggle('content');
        } catch(e) { try { Lampa.Controller.toggle('content'); } catch(e2) {} }
    }

    return {
        open: open, close: close,
        closeQuiet: function () { if (_open) _doClose(); },
        isOpen: function () { return _open; }
    };
}());

/* ─── Fullscreen Player Component ────────────────────────────────────────── */
// Этот компонент — просто запись в истории Activity (для кнопки Back).
// Реальный UI открывается через DZPlayerOverlay (position:fixed поверх всего, как Lampa Player).
function DZPlayerScreenComp(object) {
    var _empty = $('<div></div>');  // пустой render — оверлей поверх всего сам

    this.create = function () {
        // Открываем оверлей — он добавляется в body с position:fixed
        DZPlayerOverlay.open();
        // Сообщаем Activity что готовы (скрываем лоадер)
        this.activity.loader(false);
    };

    this.start = function () {
        // Activity вызывает start() когда слайд активируется.
        // Если оверлей уже открыт — он сверху, просто захватываем контроллер.
        if (DZPlayerOverlay.isOpen()) {
            Lampa.Controller.toggle('deezer_player');
        } else {
            DZPlayerOverlay.open();
        }
    };

    this.pause  = function () {};
    this.stop   = function () {};
    this.render = function () { return _empty; };

    this.destroy = function () {
        // Destroy вызывается когда Activity уходит назад.
        // Закрываем оверлей, но без backward() — иначе рекурсия.
        if (DZPlayerOverlay.isOpen()) {
            DZPlayerOverlay.closeQuiet();
        }
    };
}

/* ─── CSS ────────────────────────────────────────────────────────────────── */
function injectCSS(){
    if(document.getElementById('dz-css'))return;
    var s=document.createElement('style');s.id='dz-css';
    s.textContent=
        '.dz-view,.dzps-top,#dz-bar{--dz-accent:var(--accent,var(--color-accent,#c0392b));--dz-accent2:var(--accent2,var(--color-accent-2,#a93226));}'+
        '#dz-bar{position:fixed;bottom:0;left:0;right:0;z-index:10000;display:none;'+
        'flex-direction:row;align-items:center;gap:.8em;padding:.55em 1em;'+
        'background:rgba(16,16,16,.97);border-top:2px solid var(--dz-accent);box-shadow:0 -3px 18px #000b;}'+
        '#dz-prog-w{position:absolute;bottom:0;left:0;right:0;height:2px;background:#2a2a2a;}'+
        '#dz-prog{height:100%;width:0;background:var(--dz-accent);transition:width .4s linear;}'+
        '#dz-cov{width:3em;height:3em;border-radius:.3em;flex-shrink:0;background-size:cover;background-position:center;background-color:#222;}'+
        '#dz-info{flex:1;min-width:0;}'+
        '#dz-ttl{font-size:.92em;font-weight:600;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}'+
        '#dz-art{font-size:.78em;color:#999;white-space:nowrap;}'+
        '#dz-btns{display:flex;gap:.35em;flex-shrink:0;}'+
        '.dz-b{background:var(--dz-accent);border:none;color:#fff;padding:.32em .9em;border-radius:.25em;cursor:pointer;font-size:.88em;font-weight:600;}'+
        '.dz-b:focus,.dz-b.focused,.dz-b.focus{background:var(--dz-accent2);outline:none;}'+
        '.dz-view{padding:1em;color:#fff;padding-bottom:5em;}'+
        '.dz-hdr{display:flex;align-items:flex-start;gap:1em;margin-bottom:1.2em;}'+
        '.dz-hdr img{width:7em;height:7em;border-radius:.4em;object-fit:cover;flex-shrink:0;}'+
        '.dz-hdr-t{font-size:1.35em;font-weight:700;line-height:1.2;}'+
        '.dz-hdr-s{font-size:.85em;color:#999;margin-top:.2em;}'+
        '.dz-sec{font-size:.95em;font-weight:600;color:#ccc;padding:.6em 0 .28em;border-bottom:1px solid #282828;margin-bottom:.28em;}'+
        '.dz-track{position:relative;display:flex;align-items:center;gap:1em;padding:1em;border-radius:.35em;background:rgba(0,0,0,0.25);cursor:pointer;}'+
        '.dz-track + .dz-track{margin-top:.9em;}'+
        '.dz-track__img{position:relative;width:4em;height:4em;flex-shrink:0;border-radius:.35em;overflow:hidden;background:#1e1e1e;}'+
        '.dz-track__img img{width:100%;height:100%;object-fit:cover;display:block;}'+
        '.dz-track__n{position:absolute;top:.35em;left:.45em;font-size:.72em;color:#bbb;background:rgba(0,0,0,0.45);padding:.15em .35em;border-radius:.25em;}'+
        '.dz-track__body{flex:1;min-width:0;}'+
        '.dz-track__t{font-size:1.05em;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}'+
        '.dz-track__a{font-size:.82em;color:#8a8a8a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:.15em;}'+
        '.dz-track__d{font-size:.85em;color:#6f6f6f;flex-shrink:0;white-space:nowrap;padding-left:1em;}'+
        '.dz-track.focus::after{content:"";position:absolute;top:-.55em;left:-.55em;right:-.55em;bottom:-.55em;border-radius:.55em;border:solid .3em #fff;pointer-events:none;}'+
        '.dz-search-btn{display:flex;align-items:center;gap:.6em;width:100%;padding:.7em 1em;margin-bottom:1em;background:#1a1a1a;border:1px solid #333;border-radius:.4em;cursor:pointer;color:#fff;font-size:1em;font-weight:500;box-sizing:border-box;}'+
        '.dz-search-btn svg{width:1.1em;height:1.1em;flex-shrink:0;fill:#999;}'+
        '.dz-search-btn span{color:#999;}'+
        '.dz-search-btn:focus,.dz-search-btn.focus{border-color:var(--dz-accent);background:#1e1e1e;outline:none;}'+
        '.dz-search-btn:focus svg,.dz-search-btn.focus svg{fill:#fff;}'+
        '.dz-search-btn:focus span,.dz-search-btn.focus span{color:#fff;}'+
        '.dz-top-row{display:flex;gap:.5em;margin-bottom:.9em;flex-wrap:wrap;}'+
        '.dz-top-btn{flex:1;min-width:8em;display:flex;align-items:center;justify-content:center;padding:.65em .9em;background:#1a1a1a;border:1px solid #333;border-radius:.45em;color:#fff;cursor:pointer;font-weight:600;}'+
        '.dz-top-btn:focus,.dz-top-btn.focus{border-color:var(--dz-accent);background:#1e1e1e;outline:none;}'+
        '.dz-cards{display:flex;gap:.8em;overflow-x:auto;padding:.4em 0 .75em;scrollbar-width:thin;scrollbar-color:#333 transparent;}'+
        '.dz-card{flex-shrink:0;width:9em;cursor:pointer;}'+
        '.dz-card img{width:100%;aspect-ratio:1/1;object-fit:cover;border-radius:.35em;display:block;}'+
        '.dz-card:focus,.dz-card.focus{outline:2px solid var(--dz-accent);border-radius:.35em;}'+
        '.dz-view .card.dz-card--square .card__view{padding-bottom:100%!important;margin-bottom:.75em!important;}'+
        '.dz-view .card.dz-card--circle .card__view{padding-bottom:100%!important;margin-bottom:.75em!important;}'+
        '.dz-view .card.dz-card--circle .card__img,.dz-view .card.dz-card--circle .card__filter{border-radius:50%!important;}'+
        '.dz-view .items-cards .card__title{-webkit-line-clamp:2;line-clamp:2;max-height:2.4em;min-height:2.4em;}'+
        '.dz-view .items-cards .card__age{min-height:1.2em;}'+
        '.dz-view .card.dz-card--circle .card__title{text-align:center;}'+
        '.dz-view .items-line__title{color:#fff;}'+
        '.dz-cn{font-size:.8em;margin-top:.25em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}'+
        '.dz-cs{font-size:.7em;color:#777;white-space:nowrap;}'+
        '.dz-sbox{display:flex;gap:.55em;margin-bottom:1em;}'+
        '.dz-sinp{flex:1;background:#1a1a1a;border:1px solid #3a3a3a;color:#fff;padding:.45em .75em;border-radius:.3em;font-size:.9em;}'+
        '.dz-sinp:focus{border-color:var(--dz-accent);outline:none;}'+
        '.dz-login-wrap{max-width:30em;margin:1.5em auto;}'+
        '.dz-login-row{display:flex;align-items:center;justify-content:space-between;'+
        'padding:.6em .8em;margin-bottom:.4em;background:#1a1a1a;border-radius:.35em;'+
        'border:1px solid #2a2a2a;cursor:pointer;}'+
        '.dz-login-row:focus,.dz-login-row.focused,.dz-login-row.focus{border-color:var(--dz-accent);outline:none;background:#1e1e1e;}'+
        '.dz-lr-label{color:#aaa;font-size:.9em;flex-shrink:0;margin-right:1em;}'+
        '.dz-lr-val{color:#fff;font-size:.9em;text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:18em;}'+
        '.dz-login-btn{justify-content:center;background:var(--dz-accent);border-color:var(--dz-accent);font-weight:600;}'+
        '.dz-login-btn:focus,.dz-login-btn.focused,.dz-login-btn.focus{background:var(--dz-accent2);border-color:var(--dz-accent2);}'+
        '.dz-qr-link{display:block;margin:.55em 0;color:#fff;word-break:break-all;text-decoration:underline;}'+
        '.dz-qr-actions{display:flex;gap:.5em;flex-wrap:wrap;margin-top:.6em;}'+
        '.dz-qr-actions .dz-login-row{flex:1;min-width:10em;margin-bottom:0;}'+
        /* ── Fullscreen Player Overlay ── */
        '.dzps-overlay{position:fixed;top:0;left:0;right:0;bottom:0;width:100%;height:100%;z-index:99999;overflow:hidden;background:#0d0d0d;}'+
        '.dzps-overlay::before{content:"";position:absolute;inset:0;background-image:var(--dz-bg);background-size:cover;background-position:center;filter:blur(40px);transform:scale(1.15);opacity:.4;z-index:0;}'+
        '.dzps-overlay::after{content:"";position:absolute;inset:0;background:linear-gradient(to right,rgba(0,0,0,.75) 0%,rgba(0,0,0,.3) 60%,rgba(0,0,0,.6) 100%);z-index:0;}'+
        '.dzps-wrap{position:relative;z-index:1;width:100%;height:100%;}'+
        /* Shell — горизонтальный flex */
        '.dzps-shell{display:flex;height:100%;align-items:stretch;}'+
        /* Обложка */
        '.dzps-cover{flex:0 0 auto;width:42vh;min-width:280px;max-width:45vw;background:#111 no-repeat center/cover;position:relative;}'+
        '.dzps-cover::after{content:"";position:absolute;top:0;right:0;width:60%;height:100%;background:linear-gradient(to right,transparent,rgba(13,13,13,.95));}'+
        /* Центр */
        '.dzps-center{flex:1;min-width:0;display:flex;flex-direction:column;justify-content:center;padding:4vh 4vw 4vh 3vw;gap:0;}'+
        '.dzps-trackinfo{margin-bottom:1.8vh;}'+
        '.dzps-title{font-size:clamp(1.4em,3.5vw,2.8em);font-weight:800;color:#fff;line-height:1.1;letter-spacing:-.01em;margin-bottom:.3em;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;}'+
        '.dzps-artist{font-size:clamp(.9em,1.8vw,1.3em);color:rgba(255,255,255,.55);font-weight:400;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}'+
        /* Прогресс */
        '.dzps-prog{display:flex;align-items:center;gap:.9em;margin-bottom:2.5vh;}'+
        '.dzps-time{font-size:.85em;color:rgba(255,255,255,.45);width:3.5em;flex-shrink:0;font-variant-numeric:tabular-nums;letter-spacing:.04em;}'+
        '.dzps-time--r{text-align:right;}'+
        '.dzps-bar-wrap{flex:1;padding:.75em 0;cursor:pointer;position:relative;}'+
        '.dzps-bar-wrap:focus,.dzps-bar-wrap.focus,.dzps-bar-wrap.focused{outline:none;}'+
        '.dzps-bar-wrap:focus .dzps-bar-track,.dzps-bar-wrap.focus .dzps-bar-track,.dzps-bar-wrap.focused .dzps-bar-track{background:rgba(255,255,255,.35);box-shadow:0 0 0 2px rgba(255,255,255,.5);}'+
        '.dzps-bar-track{height:.35em;background:rgba(255,255,255,.18);border-radius:999px;position:relative;overflow:visible;}'+
        '.dzps-bar-fill{height:100%;background:#fff;border-radius:999px;pointer-events:none;}'+
        '.dzps-bar-knob{position:absolute;top:50%;width:1em;height:1em;background:#fff;border-radius:50%;transform:translate(-50%,-50%);box-shadow:0 2px 10px rgba(0,0,0,.6);pointer-events:none;transition:transform .1s;}'+
        '.dzps-bar-wrap:focus .dzps-bar-knob,.dzps-bar-wrap.focus .dzps-bar-knob{transform:translate(-50%,-50%) scale(1.4);}'+
        /* Кнопки */
        '.dzps-ctrl{display:flex;align-items:center;gap:1em;margin-bottom:1.5vh;}'+
        '.dzps-btn{display:flex;align-items:center;justify-content:center;width:3em;height:3em;border-radius:50%;color:rgba(255,255,255,.75);cursor:pointer;user-select:none;transition:background .15s,color .15s;flex-shrink:0;}'+
        '.dzps-btn svg{width:1.4em;height:1.4em;}'+
        '.dzps-btn:focus,.dzps-btn.focus,.dzps-btn.focused{outline:none;color:#fff;background:rgba(255,255,255,.18);}'+
        '.dzps-btn--side{width:2.6em;height:2.6em;}'+
        '.dzps-btn--side svg{width:1.2em;height:1.2em;}'+
        '.dzps-btn--play{width:3.8em;height:3.8em;background:rgba(255,255,255,.92);color:#000;border-radius:50%;}'+
        '.dzps-btn--play svg{width:1.7em;height:1.7em;}'+
        '.dzps-btn--play:focus,.dzps-btn--play.focus,.dzps-btn--play.focused{background:#fff;color:#000;box-shadow:0 0 0 3px rgba(255,255,255,.45);}'+
        '.dzps-btn--queue{border-radius:.5em;width:2.6em;height:2.6em;}'+
        '.dzps-btn--active{background:rgba(255,255,255,.9)!important;color:#000!important;border-radius:.5em;}'+
        '.dzps-btn--active:focus,.dzps-btn--active.focus{background:#fff!important;box-shadow:0 0 0 2px rgba(255,255,255,.6)!important;}'+
        /* Мета */
        '.dzps-meta{font-size:.8em;color:rgba(255,255,255,.35);letter-spacing:.03em;height:1.4em;}'+
        /* Очередь */
        '.dzps-qcol{flex:0 0 360px;max-width:38vw;display:flex;flex-direction:column;background:rgba(0,0,0,.45);backdrop-filter:blur(12px);border-left:1px solid rgba(255,255,255,.07);}'+
        '.dzps-qhead{font-size:.85em;font-weight:700;color:rgba(255,255,255,.5);letter-spacing:.08em;text-transform:uppercase;padding:1.4em 1.4em .8em;flex-shrink:0;border-bottom:1px solid rgba(255,255,255,.07);}'+
        '.dzps-qlist{flex:1;overflow-y:auto;overflow-x:hidden;padding:.4em .6em;}'+
        '.dzps-qlist::-webkit-scrollbar{width:.25em;}'+
        '.dzps-qlist::-webkit-scrollbar-thumb{background:rgba(255,255,255,.15);border-radius:99px;}'+
        '.dzps-qitem{display:flex;align-items:center;gap:.75em;padding:.55em .6em;border-radius:.55em;cursor:pointer;color:#fff;margin:.1em 0;}'+
        '.dzps-qitem:hover{background:rgba(255,255,255,.07);}'+
        '.dzps-qitem--now{background:rgba(255,255,255,.13);}'+
        '.dzps-qitem.focus,.dzps-qitem.focused{outline:none;background:rgba(255,255,255,.2);box-shadow:inset 0 0 0 1.5px rgba(255,255,255,.5);}'+
        '.dzps-qthumb{width:2.6em;height:2.6em;border-radius:.35em;flex-shrink:0;background:#222 no-repeat center/cover;}'+
        '.dzps-qtext{flex:1;min-width:0;}'+
        '.dzps-qname{font-size:.9em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#fff;}'+
        '.dzps-qsub{font-size:.75em;color:rgba(255,255,255,.45);margin-top:.1em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}'+
        '.dzps-qdur{font-size:.78em;color:rgba(255,255,255,.35);flex-shrink:0;padding-left:.4em;font-variant-numeric:tabular-nums;}'+
        '.dzps-qempty{padding:2em 1em;color:rgba(255,255,255,.4);text-align:center;font-size:.9em;}';
    document.head.appendChild(s);
}

/* ─── UI helpers ─────────────────────────────────────────────────────────── */
function mkTracks(tracks, comp, onPlay) {
    tracks.forEach(function (t, i) {
        var cov    = (t.album && t.album.cover_small) || '';
        var artist = (t.artist && t.artist.name) || '';
        var row    = document.createElement('div');
        row.className = 'dz-track selector';
        row.tabIndex  = 0;
        row.innerHTML = 
            '<div class="dz-track__img">' +
            (cov ? '<img src="' + esc(cov) + '" alt="">' : '') +
            '<div class="dz-track__n">' + (i + 1) + '</div>' +
            '</div>' +
            '<div class="dz-track__body">' +
            '<div class="dz-track__t">' + esc(t.title) + '</div>' +
            '<div class="dz-track__a">' + esc(artist) + '</div>' +
            '</div>' +
            '<div class="dz-track__d">' + s2t(t.duration || 0) + '</div>';
        var play = function () { onPlay(i); };
        row.addEventListener('click', play);
        $(row).on('hover:enter', play);
        comp.append(row);
    });
}

function mkLine(title, items, comp, onClick) {
    var content = Lampa.Template.js('items_line', { title: title || '' });
    var body = content.querySelector('.items-line__body');
    var scroll = new Lampa.Scroll({ horizontal: true, step: 300 });
    scroll.body(true).addClass('items-cards mapping--line');
    (items || []).forEach(function (item) {
        if (item && item.__dz && item.__dz.action === 'search') {
            var searchCard = Lampa.Template.js('card', { title: '' });
            try { searchCard.classList.add('selector'); } catch (e) {}
            try { searchCard.classList.add('dz-search-card'); } catch (e) {}
            try { searchCard.tabIndex = 0; } catch (e) {}
            var titleEl = searchCard.querySelector('.card__title');
            if (titleEl) {
                titleEl.innerHTML =
                    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">' +
                    '<path d="M10 4a6 6 0 1 0 0 12 6 6 0 0 0 0-12Zm-8 6a8 8 0 1 1 14.32 4.906l4.387 4.387-1.414 1.414-4.387-4.387A8 8 0 0 1 2 10Z"/>' +
                    '</svg>' +
                    '<span>Поиск</span>';
            }
            searchCard.addEventListener('click', function () { if (item.__dz.onClick) item.__dz.onClick(); });
            searchCard.addEventListener('hover:enter', function () { if (item.__dz.onClick) item.__dz.onClick(); });
            searchCard.addEventListener('hover:focus', function () {
                try { scroll.update(searchCard, true); } catch (e) {}
            });
            scroll.append(searchCard);
            return;
        }
        var dz = (item && item.__dz) ? item.__dz : null;
        var img = (dz && dz.img) || item.picture_medium || item.cover_medium || '';
        var titleTxt = (dz && dz.title !== undefined) ? String(dz.title || '') : (item.title || item.name || '').toString();
        var sub = (dz && dz.sub !== undefined)
            ? String(dz.sub || '')
            : ((item.artist && item.artist.name) || (item.nb_tracks ? item.nb_tracks + '\u00a0тр.' : '') || '').toString();
        var card = Lampa.Template.js('card');
        var poster = card.querySelector('.card__img');
        var t = card.querySelector('.card__title');
        var a = card.querySelector('.card__age');
        try { card.classList.add('selector'); } catch (e) {}
        try { card.tabIndex = 0; } catch (e) {}
        if (dz && dz.shape) {
            try { card.classList.add('dz-card--' + String(dz.shape)); } catch (e) {}
        }
        if (poster) poster.src = img || './img/img_broken.svg';
        if (t) t.textContent = titleTxt;
        if (a) a.textContent = sub;
        var fire = function () {
            if (dz && typeof dz.onClick === 'function') dz.onClick(item);
            else if (typeof onClick === 'function') onClick(item);
        };
        card.addEventListener('click', fire);
        card.addEventListener('hover:enter', fire);
        card.addEventListener('hover:focus', function () {
            try { scroll.update(card, true); } catch (e) {}
        });
        scroll.append(card);
    });
    body.appendChild(scroll.render(true));
    comp.append(content);
    return content;
}

function mkCards(items, comp, onClick) {
    var scroll = new Lampa.Scroll({ horizontal: true, step: 300 });
    scroll.body().addClass('items-cards mapping--line');
    items.forEach(function (item) {
        var img = item.picture_medium || item.cover_medium || '';
        var title = (item.title || item.name || '').toString();
        var sub = ((item.artist && item.artist.name) || (item.nb_tracks ? item.nb_tracks + '\u00a0тр.' : '') || '').toString();
        var card = Lampa.Template.js('card');
        var poster = card.querySelector('.card__img');
        var t = card.querySelector('.card__title');
        var a = card.querySelector('.card__age');
        try { card.classList.add('selector'); } catch (e) {}
        try { card.tabIndex = 0; } catch (e) {}
        if (poster) poster.src = img || './img/img_broken.svg';
        if (t) t.textContent = title;
        if (a) a.textContent = sub;
        card.addEventListener('click', function () { onClick(item); });
        card.addEventListener('hover:enter', function () { onClick(item); });
        card.addEventListener('hover:focus', function () {
            try { scroll.update(card, true); } catch (e) {}
        });
        scroll.append(card);
    });
    comp.append(scroll.render(true));
}
function mkSec(txt){var d=document.createElement('div');d.className='dz-sec';d.textContent=txt;return d;}
function mkLoad(txt){var d=document.createElement('div');d.style.cssText='padding:1em;color:#666';d.textContent=txt||'Загрузка…';return d;}
function svgBadgeCircle(text, bg1, bg2, fg) {
    text = String(text || '');
    bg1 = String(bg1 || '#6c5ce7');
    bg2 = String(bg2 || '#e84393');
    fg  = String(fg  || '#ffffff');
    var svg =
        '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">' +
        '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
        '<stop offset="0" stop-color="' + bg1 + '"/><stop offset="1" stop-color="' + bg2 + '"/>' +
        '</linearGradient></defs>' +
        '<circle cx="128" cy="128" r="128" fill="url(#g)"/>' +
        '<text x="128" y="140" text-anchor="middle" font-family="system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif" font-size="64" font-weight="800" fill="' + fg + '">' +
        text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') +
        '</text>' +
        '</svg>';
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

/* ─── Private Deezer API using stored checkForm token ────────────────────── */
// After login we store checkForm in SKEY_TOKEN. Without it — playlists unavailable.
var SKEY_TOKEN = 'deezer_token';
var SKEY_UID   = 'deezer_uid';

function dzApi(method, params, cb, errCb) {
    var token = _dzSGetTrim(SKEY_TOKEN, '');
    if (!token) { if (errCb) errCb('No token — please re-login'); return; }
    gwCall(method, params, token, function (r) {
        if (cb) cb(r.results !== undefined ? r.results : r);
    }, errCb || function () {});
}

/* ─── Shared component base with Scroll + Controller navigation ──────────── */
function makeComp(controllerName) {
    var scrl = new Lampa.Scroll({ mask: false, over: true });
    var last;
    scrl.body().addClass('dz-view mapping--list');
    var root = scrl.render(true);
    try { root.classList.add('layer--wheight'); } catch (e) {}

    function refreshHeight() {
        var bar = dzBar();
        try {
            if (bar && bar.style && bar.style.display !== 'none') root.mheight = bar;
            else root.mheight = null;
        } catch (e) {}
        try { if (Lampa.Layer && Lampa.Layer.update) Lampa.Layer.update(root); } catch (e) {}
    }

    function focusFirst() {
        refreshHeight();
        var items = scrl.body().find('.selector');
        var bar = dzBar();
        if (bar && bar.style && bar.style.display === 'none') bar = null;
        if (!items.length && !(bar && bar.querySelector('.selector'))) return;
        var preferred = items.filter('.card')[0] || items.filter('.dz-track')[0] || items[0];
        var target = last || preferred || (bar && bar.querySelector('.selector'));
        Lampa.Controller.collectionSet(scrl.render(), bar || false);
        Lampa.Controller.collectionFocus(target, scrl.render());
        try { if (target) scrl.update(target, true); } catch (e) {}
    }

    function bindNav() {
        refreshHeight();
        var items = scrl.body().find('.selector');
        var bar = dzBar();
        if (bar && bar.style && bar.style.display === 'none') bar = null;
        if (!items.length && !(bar && bar.querySelector('.selector'))) return;
        focusFirst();
        items.off('hover:focus').on('hover:focus', function (e) {
            last = e.currentTarget;
            refreshHeight();
            scrl.update($(e.currentTarget), true);
        });
        if (bar) {
            $(bar).find('.selector').off('hover:focus').on('hover:focus', function (e) {
                last = e.currentTarget;
            });
        }
    }

    // ActivitySlide calls Controller.toggle('content') — we just need
    // to register our collection in the toggle handler
    function registerController(comp) {
        var name = 'content';
        Lampa.Controller.add(name, {
            link: comp,
            invisible: true,
            toggle: function () {
                focusFirst();
            },
            up: function () {
                if (Navigator.canmove('up')) Navigator.move('up');
                else Lampa.Controller.toggle('head');
            },
            down: function () {
                if (Navigator.canmove('down')) Navigator.move('down');
            },
            left: function () {
                if (Navigator.canmove('left')) Navigator.move('left');
                else Lampa.Controller.toggle('menu');
            },
            right: function () {
                if (Navigator.canmove('right')) Navigator.move('right');
            },
            back: function () {
                Lampa.Activity.backward();
            }
        });
        // bind hover:focus for scroll tracking
        scrl.body().find('.selector').off('hover:focus').on('hover:focus', function (e) {
            last = e.currentTarget;
            refreshHeight();
            scrl.update($(e.currentTarget), true);
        });
        var bar = dzBar();
        if (bar) {
            $(bar).find('.selector').off('hover:focus').on('hover:focus', function (e) {
                last = e.currentTarget;
            });
        }
    }

    return {
        scrl:               scrl,
        append:             function (node) { scrl.append(node); },
        clear:              function () { last = null; try { scrl.clear(); } catch (e) { try { scrl.body().empty(); } catch (e2) {} } },
        bindNav:            bindNav,
        registerController: registerController,
        render:  function () { return scrl.render(); },
        destroy: function () { scrl.destroy(); }
    };
}

/* ─── Home component ─────────────────────────────────────────────────────── */
function HomeComp(object) {
    var c = makeComp('deezer_home');
    this.create = function () {
        var self = this;
        var search_lock = false;
        var openSearch = function () {
            if (search_lock) return;
            search_lock = true;
            Lampa.Input.edit({ title: 'Поиск в Deezer', value: '', nosave: true, free: true }, function (q) {
                search_lock = false;
                q = (q || '').trim();
                if (q) Lampa.Activity.push({ component: 'deezer_search', title: 'Поиск: ' + q, query: q });
            });
        };

        var nav = document.createElement('div');
        nav.className = 'dz-top-row';

        function mkTopBtn(label, onClick) {
            var b = document.createElement('div');
            b.className = 'dz-top-btn selector';
            b.tabIndex = 0;
            b.textContent = label;
            b.addEventListener('click', onClick);
            $(b).on('hover:enter', onClick);
            return b;
        }

        var firstBtn = null;
        var firstHomeSelector = null;
        var firstLibSelector = null;
        var wantLibFocus = false;
        var libSectionEl = null;

        var btnHome = mkTopBtn('Главная', function () {
            var t = firstHomeSelector || firstBtn;
            if (!t) return;
            Lampa.Controller.collectionFocus(t, c.scrl.render());
            try { c.scrl.update(t, true); } catch (e) {}
        });
        var btnLib = mkTopBtn('Библиотека', function () {
            if (firstLibSelector) {
                Lampa.Controller.collectionFocus(firstLibSelector, c.scrl.render());
                try { c.scrl.update(firstLibSelector, true); } catch (e) {}
            } else {
                wantLibFocus = true;
                if (libSectionEl) {
                    Lampa.Controller.collectionFocus(libSectionEl, c.scrl.render());
                    try { c.scrl.update(libSectionEl, true); } catch (e) {}
                }
                Lampa.Noty.show('Библиотека загружается…');
            }
        });
        var btnSearch = mkTopBtn('Поиск', openSearch);

        firstBtn = btnHome;
        nav.appendChild(btnHome);
        nav.appendChild(btnLib);
        nav.appendChild(btnSearch);
        c.append(nav);

        var pending = 1;
        function wait() { pending++; }
        function done() { if (--pending <= 0) { self.activity.loader(false); self.activity.toggle(); c.bindNav(); } }
        function setFirstHome(node) {
            if (!firstHomeSelector && node) {
                firstHomeSelector = node.querySelector('.selector') || null;
            }
        }
        function setFirstLib(node) {
            if (!firstLibSelector && node) {
                firstLibSelector = node.querySelector('.selector') || null;
            }
            if (wantLibFocus && firstLibSelector) {
                wantLibFocus = false;
                Lampa.Controller.collectionFocus(firstLibSelector, c.scrl.render());
                try { c.scrl.update(firstLibSelector, true); } catch (e) {}
            }
        }

        var oauth = _dzSGetTrim(SKEY_OAUTH, '');
        var arl = _dzSGetTrim(SKEY, '');
        var token = _dzSGetTrim(SKEY_TOKEN, '');
        var uid = _dzSGetTrim(SKEY_UID, '');
        var lang = 'ru';

        function openMood(q) {
            q = (q || '').trim();
            if (!q) return;
            Lampa.Activity.push({ component: 'deezer_search', title: 'Поиск: ' + q, query: q });
        }

        function normSong(t) {
            if (!t) return null;
            var id = t.id || t.SNG_ID || t.song_id || t.track_id;
            if (!id) return null;
            var title = (t.SNG_TITLE || t.title || t.SNG_TITLE_CLEAN || '').toString();
            if (!title) title = 'Трек';
            var dur = parseInt(t.DURATION || t.duration || 0, 10) || 0;
            var art = (t.ART_NAME || (t.artist && t.artist.name) || '').toString();
            var alb = (t.ALB_TITLE || (t.album && t.album.title) || '').toString();
            var hash = (t.ALB_PICTURE || (t.album && (t.album.md5_image || t.album.cover)) || '').toString();
            function coverFromHash(hash, size) {
                if (!hash) return '';
                return 'https://e-cdns-images.dzcdn.net/images/cover/' + hash + '/' + size + 'x' + size + '-000000-80-0-0.jpg';
            }
            var coverSmall = (t.album && t.album.cover_small) || coverFromHash(hash, 56);
            return {
                id: parseInt(id, 10) || id,
                title: title,
                duration: dur,
                artist: { name: art },
                album: { title: alb, cover_small: coverSmall, cover_medium: coverFromHash(hash, 250) }
            };
        }

        function pickArray(x) {
            if (Array.isArray(x)) return x;
            if (x && Array.isArray(x.data)) return x.data;
            if (x && x.SONGS && Array.isArray(x.SONGS.data)) return x.SONGS.data;
            if (x && x.songs && Array.isArray(x.songs)) return x.songs;
            if (x && x.tracks && Array.isArray(x.tracks.data)) return x.tracks.data;
            return [];
        }

        function startFlow(configId) {
            if (oauth && PROXY) {
                wait();
                proxyPost('/oauth/flow', { access_token: oauth, limit: 60 }, function (res) {
                    var tr = (res && res.data) || [];
                    if (tr && tr.length) {
                        DZPlayer.play(tr[0], tr, 0);
                        Lampa.Activity.push({ component: 'deezer_player_screen', title: 'Плеер' });
                    } else {
                        Lampa.Noty.show('Flow: пусто');
                    }
                    done();
                }, function (e) {
                    Lampa.Noty.show('Flow: ' + e);
                    done();
                });
                return;
            }

            if (PROXY && arl && token && uid) {
                wait();
                proxyPost('/gw/flow', { arl: arl, token: token, user_id: uid, config_id: configId || 'default' }, function (res) {
                    var rr = res && (res.results || res);
                    var songs = pickArray(rr);
                    var tr = songs.map(normSong).filter(function (x) { return !!x; });
                    if (tr && tr.length) {
                        DZPlayer.play(tr[0], tr, 0);
                        Lampa.Activity.push({ component: 'deezer_player_screen', title: 'Плеер' });
                    } else {
                        Lampa.Noty.show('Flow: пусто');
                    }
                    done();
                }, function (e) {
                    Lampa.Noty.show('Flow: ' + e);
                    done();
                });
                return;
            }

            Lampa.Noty.show('Flow: нужен вход (QR или логин/пароль)');
        }

        function gwUnwrap(o) {
            if (!o || typeof o !== 'object') return null;
            if (o.data && typeof o.data === 'object') return o.data;
            if (o.DATA && typeof o.DATA === 'object') return o.DATA;
            return o;
        }

        function gwCover(type, md5, size) {
            type = (type || '').toString() || 'cover';
            md5 = (md5 || '').toString();
            size = parseInt(size || 250, 10) || 250;
            if (!md5) return '';
            return 'https://e-cdns-images.dzcdn.net/images/' + type + '/' + md5 + '/' + size + 'x' + size + '-000000-80-0-0.jpg';
        }

        function gwToCard(it) {
            var d = gwUnwrap(it) || {};
            var t = (d.__TYPE__ || it.__TYPE__ || d.type || d.TYPE || '').toString().toLowerCase();
            if (t.indexOf('playlist') !== -1) {
                var id = d.PLAYLIST_ID || d.id;
                if (!id) return null;
                var md5 = d.PLAYLIST_PICTURE || (d.picture && d.picture.md5);
                var ptype = d.PICTURE_TYPE || 'playlist';
                return {
                    id: String(id),
                    title: d.TITLE || d.title || 'Плейлист',
                    cover_medium: gwCover(ptype, md5, 250),
                    __dz: { shape: 'square', onClick: function (pl) { Lampa.Activity.push({ component: 'deezer_playlist', title: pl.title, playlist: pl }); } }
                };
            }
            if (t.indexOf('album') !== -1) {
                var aid = d.ALB_ID || d.id;
                if (!aid) return null;
                var amd5 = d.ALB_PICTURE || (d.picture && d.picture.md5);
                var artist = '';
                try {
                    if (Array.isArray(d.ARTISTS) && d.ARTISTS[0]) artist = d.ARTISTS[0].ART_NAME || '';
                } catch (e) {}
                return {
                    id: String(aid),
                    title: d.ALB_TITLE || d.title || 'Альбом',
                    cover_medium: gwCover('cover', amd5, 250),
                    artist: { name: artist },
                    __dz: { shape: 'square', onClick: function (a) { Lampa.Activity.push({ component: 'deezer_album', title: a.title || 'Альбом', album: a }); } }
                };
            }
            if (t.indexOf('artist') !== -1) {
                var arid = d.ART_ID || d.id;
                if (!arid) return null;
                var armd5 = d.ART_PICTURE || (d.picture && d.picture.md5);
                return {
                    id: String(arid),
                    name: d.ART_NAME || d.name || 'Артист',
                    picture_medium: gwCover('artist', armd5, 250),
                    __dz: { shape: 'circle', onClick: function (a) { Lampa.Activity.push({ component: 'deezer_artist', title: a.name || 'Артист', artist: a }); } }
                };
            }
            if (t.indexOf('flow') !== -1) {
                var fid = d.id || d.CONFIG_ID || d.config_id;
                var title = d.title || d.TITLE || 'Flow';
                var pmd5 = '';
                var ptype2 = '';
                try {
                    var pics = it.pictures || d.pictures;
                    if (Array.isArray(pics) && pics[0]) { pmd5 = pics[0].md5 || ''; ptype2 = pics[0].type || ''; }
                } catch (e2) {}
                return {
                    id: String(fid || 'default'),
                    title: title,
                    cover_medium: gwCover(ptype2 || 'flow', pmd5, 250) || svgBadgeCircle('Flow', '#7c3aed', '#ec4899', '#fff'),
                    __dz: { shape: 'circle', onClick: function (x) { startFlow(x.id); } }
                };
            }
            if (t.indexOf('song') !== -1 || t.indexOf('track') !== -1) {
                var tr = normSong(d) || normSong(it);
                if (!tr) return null;
                tr.cover_medium = (tr.album && tr.album.cover_medium) || '';
                tr.__dz = tr.__dz || {};
                tr.__dz.shape = 'circle';
                tr.__dz.sub = (tr.artist && tr.artist.name) ? tr.artist.name : '';
                tr.__dz.onClick = function () {
                    DZPlayer.play(tr, [tr], 0);
                    Lampa.Activity.push({ component: 'deezer_player_screen', title: 'Плеер' });
                };
                return tr;
            }
            return null;
        }

        function renderWebHome(res) {
            var rr = res && (res.results || res);
            var sections = rr && rr.sections;
            if (!Array.isArray(sections) || !sections.length) return;
            for (var i = 0; i < sections.length; i++) {
                var s = sections[i] || {};
                var title = (s.title || s.TITLE || '').toString().trim();
                var items = s.items || s.ITEMS || [];
                if (!Array.isArray(items) || !items.length) continue;
                var mapped = items.map(gwToCard).filter(function (x) { return !!x; });
                if (!mapped.length) continue;
                var node = mkLine(title || 'Deezer', mapped, c, function () {});
                setFirstHome(node);
            }
        }

        if (PROXY && arl && token) {
            wait();
            proxyPost('/gw/page', { arl: arl, token: token, user_id: uid, page: 'home', lang: lang }, function (res) {
                renderWebHome(res);
                done();
            }, function () { done(); });
        }

        var flowItems = [
            { __dz: { title: 'Flow', sub: '', shape: 'circle', img: svgBadgeCircle('Flow', '#7c3aed', '#ec4899', '#fff'), onClick: function(){ startFlow('default'); } } },
            { __dz: { title: 'Счастье', sub: '', shape: 'circle', img: svgBadgeCircle('😊', '#f59e0b', '#ef4444', '#111'), onClick: function(){ openMood('happy'); } } },
            { __dz: { title: 'Треня', sub: '', shape: 'circle', img: svgBadgeCircle('🏃', '#22c55e', '#06b6d4', '#051b13'), onClick: function(){ openMood('workout'); } } },
            { __dz: { title: 'Вечер', sub: '', shape: 'circle', img: svgBadgeCircle('🎉', '#a855f7', '#f43f5e', '#fff'), onClick: function(){ openMood('party'); } } },
            { __dz: { title: 'Чил', sub: '', shape: 'circle', img: svgBadgeCircle('🌴', '#06b6d4', '#3b82f6', '#fff'), onClick: function(){ openMood('chill'); } } },
            { __dz: { title: 'Сад', sub: '', shape: 'circle', img: svgBadgeCircle('😔', '#64748b', '#475569', '#fff'), onClick: function(){ openMood('sad'); } } },
            { __dz: { title: 'Любовь', sub: '', shape: 'circle', img: svgBadgeCircle('💘', '#fb7185', '#a855f7', '#fff'), onClick: function(){ openMood('love'); } } },
            { __dz: { title: 'Фокус', sub: '', shape: 'circle', img: svgBadgeCircle('🧘', '#84cc16', '#22c55e', '#071d0d'), onClick: function(){ openMood('focus'); } } }
        ];
        var nodeFlow = mkLine('Flow', flowItems, c, function () {});
        setFirstHome(nodeFlow);

        var recent = getRecentTracks();
        if (recent && recent.length) {
            var list = recent.slice(0, 18);
            var items = list.map(function (t, idx) {
                return {
                    id: t.id,
                    title: t.title || '',
                    duration: t.duration || 0,
                    preview: t.preview,
                    artist: t.artist,
                    album: t.album,
                    cover_medium: (t.album && (t.album.cover_medium || t.album.cover_big || t.album.cover_xl)) || '',
                    __dz: {
                        shape: 'circle',
                        sub: (t.artist && t.artist.name) ? t.artist.name : '',
                        onClick: function () {
                            DZPlayer.play(list[idx], list, idx);
                            Lampa.Activity.push({ component: 'deezer_player_screen', title: 'Плеер' });
                        }
                    }
                };
            });
            var nodeRecent = mkLine('Продолжить', items, c, function () {});
            setFirstHome(nodeRecent);
        }

        if (oauth && PROXY) {
            wait();
            proxyPost('/oauth/history', { access_token: oauth, limit: 40, index: 0 }, function (res) {
                var tr = (res && res.data) || [];
                if (tr && tr.length) {
                    var list = tr.slice(0, 18);
                    var items = list.map(function (t, idx) {
                        return {
                            id: t.id,
                            title: t.title || '',
                            duration: t.duration || 0,
                            preview: t.preview,
                            artist: t.artist,
                            album: t.album,
                            cover_medium: (t.album && (t.album.cover_medium || t.album.cover_big || t.album.cover_xl)) || '',
                            __dz: {
                                shape: 'circle',
                                sub: (t.artist && t.artist.name) ? t.artist.name : '',
                                onClick: function () {
                                    DZPlayer.play(list[idx], list, idx);
                                    Lampa.Activity.push({ component: 'deezer_player_screen', title: 'Плеер' });
                                }
                            }
                        };
                    });
                    var nodeHist = mkLine('Продолжить стриминг', items, c, function () {});
                    setFirstHome(nodeHist);
                }
                done();
            }, function () { done(); });

            wait();
            proxyPost('/oauth/reco_playlists', { access_token: oauth, limit: 20, index: 0 }, function (res) {
                var pls = (res && res.data) || [];
                pls = (pls || []).slice(0, 20).map(function (p) {
                    return {
                        id: p.id,
                        title: p.title || 'Плейлист',
                        cover_medium: p.picture_medium || p.picture || '',
                        nb_tracks: p.nb_tracks || 0,
                        __dz: { shape: 'square' }
                    };
                });
                if (pls.length) {
                    var node = mkLine('Плейлисты для тебя', pls, c, function (pl) {
                        Lampa.Activity.push({ component: 'deezer_playlist', title: pl.title, playlist: pl });
                    });
                    setFirstHome(node);
                }
                done();
            }, function () { done(); });

            wait();
            proxyPost('/oauth/reco_albums', { access_token: oauth, limit: 20, index: 0 }, function (res) {
                var al = (res && res.data) || [];
                al = (al || []).slice(0, 20).map(function (a) { a.__dz = a.__dz || {}; a.__dz.shape = 'square'; return a; });
                if (al.length) {
                    var node = mkLine('Альбомы для тебя', al, c, function (a) {
                        Lampa.Activity.push({ component: 'deezer_album', title: a.title || 'Альбом', album: a });
                    });
                    setFirstHome(node);
                }
                done();
            }, function () { done(); });

            wait();
            proxyPost('/oauth/reco_artists', { access_token: oauth, limit: 20, index: 0 }, function (res) {
                var ar = (res && res.data) || [];
                ar = (ar || []).slice(0, 20).map(function (a) { a.__dz = a.__dz || {}; a.__dz.shape = 'circle'; return a; });
                if (ar.length) {
                    var node = mkLine('Артисты для тебя', ar, c, function (a) {
                        Lampa.Activity.push({ component: 'deezer_artist', title: a.name || 'Артист', artist: a });
                    });
                    setFirstHome(node);
                }
                done();
            }, function () { done(); });

            wait();
            proxyPost('/oauth/reco_tracks', { access_token: oauth, limit: 24, index: 0 }, function (res) {
                var tr = (res && res.data) || [];
                tr = (tr || []).slice(0, 24);
                if (tr.length) {
                    c.append(mkSec('Рекомендации для тебя'));
                    mkTracks(tr, c, function (i) { DZPlayer.play(tr[i], tr, i); Lampa.Activity.push({ component: 'deezer_player_screen', title: 'Плеер' }); });
                }
                done();
            }, function () { done(); });
        }

        wait();
        apiGet('/chart/0/playlists', { limit: 20 }, function (r) {
            var pls = (r.data || []).slice(0, 20).map(function (p) {
                return {
                    id: p.id,
                    title: p.title || 'Плейлист',
                    cover_medium: p.picture_medium || p.picture || '',
                    nb_tracks: p.nb_tracks || 0,
                    __dz: { shape: 'square' }
                };
            });
            if (pls.length) {
                var node = mkLine('Подборки', pls, c, function (pl) {
                    Lampa.Activity.push({ component: 'deezer_playlist', title: pl.title, playlist: pl });
                });
                setFirstHome(node);
            }
            done();
        }, function () { done(); });

        wait();
        apiGet('/editorial/0/releases', { limit: 20 }, function (r) {
            var al = (r.data || []).slice(0, 20).map(function (a) {
                a.__dz = a.__dz || {};
                a.__dz.shape = 'square';
                return a;
            });
            if (al.length) {
                var node = mkLine('Новые релизы', al, c, function (a) {
                    Lampa.Activity.push({ component: 'deezer_album', title: a.title || 'Альбом', album: a });
                });
                setFirstHome(node);
            }
            done();
        }, function () { done(); });

        wait();
        apiGet('/chart/0/tracks', { limit: 40 }, function (r) {
            var tr = (r.data || []).slice(0, 40);
            c.append(mkSec('Популярное сейчас'));
            mkTracks(tr, c, function (i) { DZPlayer.play(tr[i], tr, i); Lampa.Activity.push({ component: 'deezer_player_screen', title: 'Плеер' }); });
            done();
        }, function () { done(); });

        wait();
        apiGet('/chart/0/albums', { limit: 16 }, function (r) {
            var al = (r.data || []).slice(0, 16).map(function (a) { a.__dz = a.__dz || {}; a.__dz.shape = 'square'; return a; });
            if (al.length) {
                var node = mkLine('Топ альбомы', al, c, function (a) { Lampa.Activity.push({ component: 'deezer_album', title: a.title || 'Альбом', album: a }); });
                setFirstHome(node);
            }
            done();
        }, function () { done(); });

        wait();
        apiGet('/chart/0/artists', { limit: 16 }, function (r) {
            var ar = (r.data || []).slice(0, 16).map(function (a) { a.__dz = a.__dz || {}; a.__dz.shape = 'circle'; return a; });
            if (ar.length) {
                var node = mkLine('Топ артисты', ar, c, function (a) { Lampa.Activity.push({ component: 'deezer_artist', title: a.name || 'Артист', artist: a }); });
                setFirstHome(node);
            }
            done();
        }, function () { done(); });

        var libHdr = mkSec('Библиотека');
        try { libHdr.classList.add('selector'); } catch (e) {}
        try { libHdr.tabIndex = 0; } catch (e) {}
        c.append(libHdr);
        libSectionEl = libHdr;

        if (oauth && PROXY) {
            wait();
            proxyPost('/oauth/playlists', { access_token: oauth, limit: 50, index: 0 }, function (res) {
                var pls = (res && res.data) || [];
                if (pls.length) {
                    var loved = null;
                    for (var i = 0; i < pls.length; i++) {
                        var t = (pls[i].TITLE || pls[i].title || '').toString().toLowerCase();
                        if (t.indexOf('любим') !== -1 || t.indexOf('loved') !== -1 || t.indexOf('favorite') !== -1 || t.indexOf('favourite') !== -1) {
                            loved = pls[i];
                            break;
                        }
                    }
                    if (loved) {
                        var nodeLoved = mkLine('Моя музыка', [{
                            id:           loved.PLAYLIST_ID || loved.id,
                            title:        loved.TITLE || loved.title || 'Любимые треки',
                            cover_medium: loved.PICTURE_URL || loved.picture_medium || loved.picture || '',
                            nb_tracks:    loved.NB_SONG || loved.nb_tracks || 0,
                            __dz:         { shape: 'square' }
                        }], c, function (pl) {
                            Lampa.Activity.push({ component: 'deezer_playlist', title: pl.title, playlist: pl });
                        });
                        setFirstLib(nodeLoved);
                    }
                    var nodePls = mkLine('Мои плейлисты', pls.map(function (p) {
                        return {
                            id:           p.PLAYLIST_ID || p.id,
                            title:        p.TITLE || p.title || 'Плейлист',
                            cover_medium: p.PICTURE_URL || p.picture_medium || p.picture || '',
                            nb_tracks:    p.NB_SONG || p.nb_tracks || 0,
                            __dz:         { shape: 'square' }
                        };
                    }), c, function (pl) {
                        Lampa.Activity.push({ component: 'deezer_playlist', title: pl.title, playlist: pl });
                    });
                    setFirstLib(nodePls);
                }
                done();
            }, function (e) {
                if (String(e || '').indexOf('api:') !== -1 || String(e || '').indexOf('oauth:') !== -1) {
                    Lampa.Storage.set(SKEY_OAUTH, '');
                }
                Lampa.Noty.show('Deezer: библиотека недоступна: ' + e);
                done();
            });
        } else {
            // Account playlists via ARL (proxy)
            if (arl && PROXY) {
                wait();
                proxyPost('/playlists', { arl: arl, nb: 50, start: 0 }, function (res) {
                    var pls = (res && res.data) || [];
                    if (pls.length) {
                        var loved = null;
                        for (var i = 0; i < pls.length; i++) {
                            var t = (pls[i].TITLE || pls[i].title || '').toString().toLowerCase();
                            if (t.indexOf('любим') !== -1 || t.indexOf('loved') !== -1 || t.indexOf('favorite') !== -1 || t.indexOf('favourite') !== -1) {
                                loved = pls[i];
                                break;
                            }
                        }
                        if (loved) {
                            var nodeLoved = mkLine('Моя музыка', [{
                                id:           loved.PLAYLIST_ID || loved.id,
                                title:        loved.TITLE || loved.title || 'Любимые треки',
                                cover_medium: loved.PICTURE_URL || loved.picture_medium || loved.picture || '',
                                nb_tracks:    loved.NB_SONG || loved.nb_tracks || 0,
                                __dz:         { shape: 'square' }
                            }], c, function (pl) {
                                Lampa.Activity.push({ component: 'deezer_playlist', title: pl.title, playlist: pl });
                            });
                            setFirstLib(nodeLoved);
                        }
                        var nodePls = mkLine('Мои плейлисты', pls.map(function (p) {
                            return {
                                id:           p.PLAYLIST_ID || p.id,
                                title:        p.TITLE || p.title || 'Плейлист',
                                cover_medium: p.PICTURE_URL || p.picture_medium || p.picture || '',
                                nb_tracks:    p.NB_SONG || p.nb_tracks || 0,
                                __dz:         { shape: 'square' }
                            };
                        }), c, function (pl) {
                            Lampa.Activity.push({ component: 'deezer_playlist', title: pl.title, playlist: pl });
                        });
                        setFirstLib(nodePls);
                    }
                    done();
                }, function (e) {
                    Lampa.Noty.show('Deezer: библиотека недоступна: ' + e);
                    done();
                });
            }
        }

        // Account playlists (legacy) — requires checkForm token in Storage
        var token = _dzSGetTrim(SKEY_TOKEN, '');
        var uid   = _dzSGetTrim(SKEY_UID, '');
        if (!oauth && token && uid) {
            wait();
            dzApi('playlist.getList', { user_id: uid, nb: 50, start: 0 }, function (res) {
                var pls = (res && res.data) || [];
                if (pls.length) {
                    var nodeLegacy = mkLine('Мои плейлисты', pls.map(function (p) {
                        return {
                            id:           p.PLAYLIST_ID || p.id,
                            title:        p.TITLE || p.title || 'Плейлист',
                            cover_medium: p.PICTURE_URL || '',
                            nb_tracks:    p.NB_SONG || p.nb_tracks || 0,
                            __dz:         { shape: 'square' }
                        };
                    }), c, function (pl) {
                        Lampa.Activity.push({ component: 'deezer_playlist', title: pl.title, playlist: pl });
                    });
                    setFirstLib(nodeLegacy);
                }
                done();
            }, function () { done(); });
        }
        done();
    };
    this.start   = function () { c.registerController(this); Lampa.Controller.toggle('content'); };
    this.pause   = this.stop = function () {};
    this.render  = function () { return c.render(); };
    this.destroy = function () { c.destroy(); };
}

/* ─── Search component ───────────────────────────────────────────────────── */
function SearchComp(object) {
    var c = makeComp('deezer_search');
    this.create = function () {
        var self = this;
        c.append(mkLoad('Поиск «' + esc(object.query || '') + '»…'));
        apiGet('/search', { q: object.query || '', limit: 50 }, function (r) {
            var tr = (r.data || []).slice(0, 50);
            c.clear();
            c.append(mkSec('Результаты: «' + esc(object.query || '') + '»'));
            if (!tr.length) c.append(mkLoad('Ничего не найдено'));
            else mkTracks(tr, c, function (i) { DZPlayer.play(tr[i], tr, i); });
            self.activity.loader(false); self.activity.toggle(); c.bindNav();
        }, function () {
            c.clear();
            var d = document.createElement('div');
            d.style.cssText = 'padding:1em;color:#e44';
            d.textContent = 'Ошибка поиска';
            c.append(d);
            self.activity.loader(false); self.activity.toggle();
        });
    };
    this.start   = function () { c.registerController(this); Lampa.Controller.toggle('content'); };
    this.pause   = this.stop = function () {};
    this.render  = function () { return c.render(); };
    this.destroy = function () { c.destroy(); };
}

/* ─── Album component ────────────────────────────────────────────────────── */
function AlbumComp(object) {
    var c = makeComp('deezer_album');
    this.create = function () {
        var self = this, album = object.album;
        c.append(mkLoad());
        apiGet('/album/' + album.id, {}, function (r) {
            var tr = (r.tracks && r.tracks.data) || [];
            tr.forEach(function (t) {
                if (!t.album) t.album = { cover_small: album.cover_small, cover_medium: album.cover_medium };
                if (!t.artist && r.artist) t.artist = r.artist;
            });
            c.clear();
            var hdr = document.createElement('div'); hdr.className = 'dz-hdr';
            hdr.innerHTML = '<img src="' + esc(album.cover_medium || '') + '" alt="">' +
                '<div><div class="dz-hdr-t">' + esc(r.title || album.title || '') + '</div>' +
                '<div class="dz-hdr-s">' + esc((r.artist && r.artist.name) || '') + '</div>' +
                '<div class="dz-hdr-s">' + esc(r.release_date || '') + (tr.length ? ' · ' + tr.length + ' тр.' : '') + '</div></div>';
            c.append(hdr); c.append(mkSec('Треки'));
            mkTracks(tr, c, function (i) { DZPlayer.play(tr[i], tr, i); });
            self.activity.loader(false); self.activity.toggle(); c.bindNav();
        }, function () {
            c.clear();
            var d = document.createElement('div');
            d.style.cssText = 'padding:1em;color:#e44';
            d.textContent = 'Ошибка загрузки';
            c.append(d);
            self.activity.loader(false); self.activity.toggle();
        });
    };
    this.start   = function () { c.registerController(this); Lampa.Controller.toggle('content'); };
    this.pause   = this.stop = function () {};
    this.render  = function () { return c.render(); };
    this.destroy = function () { c.destroy(); };
}

/* ─── Playlist component ─────────────────────────────────────────────────── */
function PlaylistComp(object) {
    var c = makeComp('deezer_playlist');
    this.create = function () {
        var self = this, pl = object.playlist;
        c.append(mkLoad());
        function coverFromHash(hash, size) {
            if (!hash) return '';
            return 'https://e-cdns-images.dzcdn.net/images/cover/' + hash + '/' + size + 'x' + size + '-000000-80-0-0.jpg';
        }
        function normTrack(t) {
            var id = t && (t.id || t.SNG_ID || t.song_id || t.track_id);
            if (!id) return null;
            var numId = parseInt(id, 10);
            if (!numId || numId <= 0) return null;  // отбрасываем невалидные id
            var title = (t.SNG_TITLE || t.title || t.SNG_TITLE_CLEAN || '').toString();
            if (!title) title = 'Трек';
            var dur = parseInt(t.DURATION || t.duration || 0, 10) || 0;
            var art = (t.ART_NAME || (t.artist && t.artist.name) || '').toString();
            var alb = (t.ALB_TITLE || (t.album && t.album.title) || '').toString();
            var hash = (t.ALB_PICTURE || (t.album && (t.album.md5_image || t.album.cover)) || '').toString();
            function coverFromHash(hash, size) {
                if (!hash) return '';
                return 'https://e-cdns-images.dzcdn.net/images/cover/' + hash + '/' + size + 'x' + size + '-000000-80-0-0.jpg';
            }
            var coverSmall  = (t.album && t.album.cover_small)  || coverFromHash(hash, 56);
            var coverMedium = (t.album && t.album.cover_medium) || coverFromHash(hash, 250);
            var coverBig    = (t.album && t.album.cover_big)    || coverFromHash(hash, 500);
            return {
                id:       numId,
                title:    title,
                duration: dur,
                preview:  t.preview || t.PREVIEW || '',   // сохраняем preview если есть
                artist:   { name: art },
                album:    { title: alb, cover_small: coverSmall, cover_medium: coverMedium, cover_big: coverBig }
            };
        }
        function renderPlaylist(title, picture, tracks) {
            c.clear();
            var hdr = document.createElement('div'); hdr.className = 'dz-hdr';
            hdr.innerHTML = '<img src="' + esc(picture || pl.cover_medium || '') + '" alt="">' +
                '<div><div class="dz-hdr-t">' + esc(title || pl.title || '') + '</div>' +
                '<div class="dz-hdr-s">' + (tracks.length || 0) + ' треков</div></div>';
            c.append(hdr);
            c.append(mkSec('Треки'));
            mkTracks(tracks, c, function (i) { DZPlayer.play(tracks[i], tracks, i); });
            self.activity.loader(false); self.activity.toggle(); c.bindNav();
        }

        var oauth = _dzSGetTrim(SKEY_OAUTH, '');
        if (oauth && PROXY) {
            proxyPost('/oauth/playlist_tracks', { access_token: oauth, playlist_id: parseInt(pl.id, 10), index: 0, limit: 200 }, function (res) {
                var tr = (res && res.data) || [];
                renderPlaylist(pl.title, pl.cover_medium, tr);
            }, function () {
                apiGet('/playlist/' + pl.id, {}, function (r) {
                    var tr = (r.tracks && r.tracks.data) || [];
                    renderPlaylist(r.title || pl.title, r.picture_medium || pl.cover_medium, tr);
                }, function () {
                    c.clear();
                    var d = document.createElement('div');
                    d.style.cssText = 'padding:1em;color:#e44';
                    d.textContent = 'Ошибка загрузки плейлиста';
                    c.append(d);
                    self.activity.loader(false); self.activity.toggle();
                });
            });
            return;
        }

        var arl = _dzSGetTrim(SKEY, '');
        if (arl && PROXY) {
            proxyPost('/playlist', { arl: arl, playlist_id: parseInt(pl.id, 10), start: 0, nb: 200 }, function (res) {
                var songs = (res && res.data) || [];
                var tracks = songs.map(normTrack).filter(function (x) { return !!x; });
                renderPlaylist(pl.title, pl.cover_medium, tracks);
            }, function () {
                apiGet('/playlist/' + pl.id, {}, function (r) {
                    var tr = (r.tracks && r.tracks.data) || [];
                    renderPlaylist(r.title || pl.title, r.picture_medium || pl.cover_medium, tr);
                }, function () {
                    c.clear();
                    var d = document.createElement('div');
                    d.style.cssText = 'padding:1em;color:#e44';
                    d.textContent = 'Ошибка загрузки плейлиста';
                    c.append(d);
                    self.activity.loader(false); self.activity.toggle();
                });
            });
            return;
        }

        apiGet('/playlist/' + pl.id, {}, function (r) {
            var tr = (r.tracks && r.tracks.data) || [];
            renderPlaylist(r.title || pl.title, r.picture_medium || pl.cover_medium, tr);
        }, function () {
            c.clear();
            var d = document.createElement('div');
            d.style.cssText = 'padding:1em;color:#e44';
            d.textContent = 'Ошибка загрузки плейлиста';
            c.append(d);
            self.activity.loader(false); self.activity.toggle();
        });
    };
    this.start   = function () { c.registerController(this); Lampa.Controller.toggle('content'); };
    this.pause   = this.stop = function () {};
    this.render  = function () { return c.render(); };
    this.destroy = function () { c.destroy(); };
}

/* ─── Artist component ───────────────────────────────────────────────────── */
function ArtistComp(object) {
    var c = makeComp('deezer_artist');
    this.create = function () {
        var self = this, artist = object.artist;
        c.append(mkLoad());
        var done = 0, tops = [], albs = [];
        function fin() {
            if (++done < 2) return;
            c.clear();
            var hdr = document.createElement('div'); hdr.className = 'dz-hdr';
            hdr.innerHTML = '<img src="' + esc(artist.picture_medium || '') + '" alt="" style="border-radius:50%">' +
                '<div><div class="dz-hdr-t">' + esc(artist.name || '') + '</div></div>';
            c.append(hdr);
            if (albs.length) { mkLine('Альбомы', albs, c, function (a) { Lampa.Activity.push({ component: 'deezer_album', title: a.title || 'Альбом', album: a }); }); }
            if (tops.length) { c.append(mkSec('Топ треки')); mkTracks(tops, c, function (i) { DZPlayer.play(tops[i], tops, i); }); }
            self.activity.loader(false); self.activity.toggle(); c.bindNav();
        }
        apiGet('/artist/' + artist.id + '/top',    { limit: 50 }, function (r) { tops = (r.data || []).slice(0, 50); fin(); }, function () { fin(); });
        apiGet('/artist/' + artist.id + '/albums', { limit: 20 }, function (r) { albs = (r.data || []).slice(0, 20); fin(); }, function () { fin(); });
    };
    this.start   = function () { c.registerController(this); Lampa.Controller.toggle('content'); };
    this.pause   = this.stop = function () {};
    this.render  = function () { return c.render(); };
    this.destroy = function () { c.destroy(); };
}

/* ─── Deezer auth via email+password ─────────────────────────────────────── */
// Uses gw-light.php (CORS-friendly) instead of connect.deezer.com (blocks CORS)
var DZ_APP_ID = '447462';
var DZ_SECRET = 'a83bf7f38ad2f137e444727cfc3775cf';

function gwCall(method, params, token, cb, errCb) {
    var url = 'https://www.deezer.com/ajax/gw-light.php?method=' + method +
              '&input=3&api_version=1.0&api_token=' + encodeURIComponent(token || 'null') +
              '&cid=' + Date.now();
    var x = new XMLHttpRequest();
    x.open('POST', url, true);
    // text/plain — простой CORS запрос, не нужен preflight
    x.setRequestHeader('Content-Type', 'text/plain;charset=UTF-8');
    x.withCredentials = false;
    x.timeout = 15000;
    x.onload = function () {
        // Если 403 — CORS или IP блокировка
        if (x.status === 403) {
            if (errCb) errCb('gw:403:blocked');
            return;
        }
        if (x.status < 200 || x.status >= 300) {
            if (errCb) errCb('gw:http:' + x.status);
            return;
        }
        try {
            var r = JSON.parse(x.responseText);
            cb(r);
        } catch (e) { if (errCb) errCb('parse:' + e.message + ':' + x.responseText.slice(0, 80)); }
    };
    x.onerror  = function () { if (errCb) errCb('gw:network:cors_or_offline'); };
    x.ontimeout = function () { if (errCb) errCb('gw:timeout'); };
    x.send(JSON.stringify(params || {}));
}

function deezerLogin(email, password, onSuccess, onFail) {
    var passMd5 = md5hex(password);

    // Вариант 1: мобильный API напрямую из браузера (api.deezer.com, не заблокирован)
    function loginMobileDirect(onOk, onErr) {
        var MOBILE_GW = 'https://api.deezer.com/1.0/gateway.php';
        var API_KEY   = 'ZAIVAHCEISOHWAICUQUEXAEPICENGUAFAEZAIPHAELEEVAHPHUCUFONGUAPASUAY';

        function mobileGw(method, apiToken, body, cb, errCb) {
            var url = MOBILE_GW +
                '?method='       + encodeURIComponent(method) +
                '&api_version=1.0&input=3&output=3' +
                '&api_token='    + encodeURIComponent(apiToken) +
                '&api_key='      + encodeURIComponent(API_KEY) +
                '&cid='          + Date.now();
            var x = new XMLHttpRequest();
            x.open('POST', url, true);
            x.setRequestHeader('Content-Type', 'application/json; charset=UTF-8');
            x.timeout = 15000;
            x.onload = function () {
                if (x.status < 200 || x.status >= 300) {
                    errCb('mobile_gw:' + x.status);
                    return;
                }
                try {
                    var r = JSON.parse(x.responseText);
                    if (r.error && typeof r.error === 'object' && Object.keys(r.error).length) {
                        errCb('mobile_err:' + JSON.stringify(r.error).slice(0, 80));
                        return;
                    }
                    cb(r.results !== undefined ? r.results : r);
                } catch (e) { errCb('mobile_parse:' + x.responseText.slice(0, 80)); }
            };
            x.onerror   = function () { errCb('mobile_network'); };
            x.ontimeout = function () { errCb('mobile_timeout'); };
            x.send(JSON.stringify(body || {}));
        }

        // Шаг 1: анонимный getUserData → checkForm
        mobileGw('deezer.getUserData', 'null', {}, function (ud) {
            var token = (ud && ud.checkForm) || '';
            if (!token) { onErr('mobile:no_checkForm'); return; }

            // Шаг 2: checkCredentials
            mobileGw('user.checkCredentials', token,
                { login: email, password: passMd5, checkFormLogin: token },
                function () {
                    // Шаг 3: getUserData снова — теперь авторизованный
                    mobileGw('deezer.getUserData', 'null', {}, function (ud2) {
                        var token2 = (ud2 && ud2.checkForm) || '';
                        if (!token2) { onErr('mobile:no_checkForm2'); return; }

                        // Шаг 4: getArl
                        mobileGw('user.getArl', token2, {}, function (arl) {
                            var arlStr = typeof arl === 'string' ? arl : (arl && arl.arl) || '';
                            if (arlStr.length > 20) {
                                onOk(arlStr);
                            } else {
                                onErr('mobile:bad_arl:' + JSON.stringify(arl).slice(0, 60));
                            }
                        }, onErr);
                    }, onErr);
                },
                onErr
            );
        }, onErr);
    }

    // Вариант 2: прямой браузер → gw-light.php (десктоп/TV)
    function loginDirect(onDirectSuccess, onDirectFail) {
        // Шаг 1: получаем checkForm
        gwCall('deezer.getUserData', {}, 'null', function (r1) {
            console.log('[DZ direct] getUserData response:', JSON.stringify(r1).slice(0, 200));
            var token = (r1.results && r1.results.checkForm) || (r1.checkForm);
            if (!token) { onDirectFail('no_checkForm:' + JSON.stringify(r1).slice(0, 200)); return; }

            // Шаг 2: user.checkCredentials
            gwCall('user.checkCredentials', {
                login:          email,
                password:       passMd5,
                checkFormLogin: token
            }, token, function (r2) {
                var err2 = r2.error;
                if (err2 && typeof err2 === 'object' && Object.keys(err2).length) {
                    onDirectFail('credentials:' + JSON.stringify(err2));
                    return;
                }
                // Шаг 3: получаем ARL
                gwCall('user.getArl', {}, token, function (r3) {
                    var arl = r3.results;
                    if (typeof arl === 'string' && arl.length > 20) {
                        Lampa.Storage.set(SKEY_TOKEN, token);
                        var uid = r2.results && r2.results.USER && r2.results.USER.USER_ID;
                        if (uid) Lampa.Storage.set(SKEY_UID, String(uid));
                        onDirectSuccess(arl);
                    } else {
                        onDirectFail('no_arl:' + JSON.stringify(arl).slice(0, 60));
                    }
                }, onDirectFail);
            }, onDirectFail);
        }, onDirectFail);
    }

    // Вариант 3: через прокси (последний fallback)
    function loginViaProxy(onProxySuccess, onProxyFail) {
        if (!PROXY) { onProxyFail('no_proxy'); return; }
        proxyPost('/login', { email: email, password_md5: passMd5 }, function (r) {
            if (r && r.token) Lampa.Storage.set(SKEY_TOKEN, String(r.token));
            if (r && r.uid)   Lampa.Storage.set(SKEY_UID,   String(r.uid));
            if (r && r.access_token) Lampa.Storage.set(SKEY_OAUTH, String(r.access_token));
            var arl = r && r.arl;
            if (typeof arl === 'string' && arl.length > 20) onProxySuccess(arl);
            else onProxySuccess('');
        }, onProxyFail);
    }

    // Цепочка попыток: gw-light (браузер) → мобильный API (браузер) → прокси
    loginDirect(
        function (arl) { onSuccess(arl); },
        function (directErr) {
            console.warn('[DZ] gw-light failed:', directErr);
            var isCorsError = directErr.indexOf('network') !== -1 || directErr.indexOf('cors') !== -1;
            // Если CORS — мобильный API тоже не поможет, сразу прокси
            if (isCorsError) {
                loginViaProxy(
                    function (arl) { onSuccess(arl); },
                    function (proxyErr) {
                        var proxyBlocked = String(proxyErr).indexOf('403') !== -1 || String(proxyErr).indexOf('blocked') !== -1;
                        if (proxyBlocked) {
                            onFail('Все методы входа заблокированы.\nИспользуй вход по QR-коду 📱');
                        } else {
                            onFail('gw:cors; proxy: ' + proxyErr);
                        }
                    }
                );
            } else {
                // Не CORS — пробуем мобильный API (другой эндпоинт)
                loginMobileDirect(
                    function (arl) { onSuccess(arl); },
                    function (mobileErr) {
                        console.warn('[DZ] mobile api failed:', mobileErr);
                        loginViaProxy(
                            function (arl) { onSuccess(arl); },
                            function (proxyErr) {
                                var allBlocked =
                                    String(proxyErr).indexOf('403') !== -1 ||
                                    String(proxyErr).indexOf('blocked') !== -1;
                                if (allBlocked) {
                                    onFail('Все методы входа заблокированы.\nИспользуй вход по QR-коду 📱');
                                } else {
                                    onFail('gw: ' + directErr + '; mobile: ' + mobileErr + '; proxy: ' + proxyErr);
                                }
                            }
                        );
                    }
                );
            }
        }
    );
}

/* ─── Login component (all inputs via Lampa.Input) ───────────────────────── */
function LoginComp(object) {
    var c = makeComp('deezer_login');
    // store password in memory only, never trim
    var _pass = '';
    var _poll = null;

    this.create = function () {
        var arl = _dzSGetTrim(SKEY, '');
        var oauth = _dzSGetTrim(SKEY_OAUTH, '');
        var tok = _dzSGetTrim(SKEY_TOKEN, '');
        var uid = _dzSGetTrim(SKEY_UID, '');
        if (arl || oauth || (tok && uid)) {
            // Already logged in — redirect
            setTimeout(function () {
                Lampa.Activity.replace({ component: 'deezer_home', title: 'Deezer' });
            }, 50);
            return;
        }

        function clearPoll() {
            if (_poll) {
                clearInterval(_poll);
                _poll = null;
            }
        }

        function bindAction(el, fn) {
            var last = 0;
            function run() {
                var now = Date.now();
                if (now - last < 400) return;
                last = now;
                fn();
            }
            el.addEventListener('click', run);
            $(el).on('hover:enter', run);
        }

        function renderQR(code) {
            clearPoll();
            c.clear();

            var url = (PROXY || '') + '/pair?code=' + encodeURIComponent(code);

            var title = document.createElement('div');
            title.className = 'dz-sec';
            title.style.margin = '0 0 .6em';
            title.textContent = 'Вход по QR';

            var wrap = document.createElement('div');
            wrap.className = 'dz-login-wrap';

            var img = document.createElement('img');
            img.alt = 'QR';
            img.style.cssText = 'display:block;width:260px;height:260px;max-width:100%;margin:0 auto;border-radius:12px;background:#fff';
            img.src = 'https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=' + encodeURIComponent(url);

            var info = document.createElement('div');
            info.style.cssText = 'margin-top:.9em;color:#bbb;font-size:1.05em;line-height:1.35';
            info.textContent = 'Открой ссылку на телефоне, нажми «Войти через Deezer», затем вернись на ТВ:';

            var link = document.createElement('a');
            link.className = 'dz-qr-link';
            link.href = url;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.textContent = url;

            function copyText(text) {
                try {
                    if (navigator.clipboard && navigator.clipboard.writeText) {
                        navigator.clipboard.writeText(text).then(function () {
                            Lampa.Noty.show('Ссылка скопирована');
                        }, function () {
                            window.prompt('Скопируй ссылку', text);
                        });
                        return;
                    }
                } catch (e) {}
                try { window.prompt('Скопируй ссылку', text); } catch (e2) {}
            }

            var actions = document.createElement('div');
            actions.className = 'dz-qr-actions';

            var openBtn = document.createElement('div');
            openBtn.className = 'dz-login-row dz-login-btn selector';
            openBtn.tabIndex = 0;
            openBtn.textContent = 'Открыть ссылку';
            var onOpen = function () {
                try { window.open(url, '_blank'); } catch (e) {}
            };
            bindAction(openBtn, onOpen);

            var copyBtn = document.createElement('div');
            copyBtn.className = 'dz-login-row selector';
            copyBtn.tabIndex = 0;
            copyBtn.textContent = 'Скопировать ссылку';
            var onCopy = function () { copyText(url); };
            bindAction(copyBtn, onCopy);

            actions.appendChild(openBtn);
            actions.appendChild(copyBtn);

            var codeEl = document.createElement('div');
            codeEl.style.cssText = 'margin-top:.6em;color:#bbb';
            codeEl.innerHTML = 'Код: <b style="color:#fff">' + esc(code) + '</b>';

            var cancel = document.createElement('div');
            cancel.className = 'dz-login-row dz-login-btn selector';
            cancel.tabIndex = 0;
            cancel.textContent = '✕ Отмена';
            var onCancel = function () { clearPoll(); renderLogin(); };
            bindAction(cancel, onCancel);

            wrap.appendChild(img);
            wrap.appendChild(info);
            wrap.appendChild(link);
            wrap.appendChild(actions);
            wrap.appendChild(codeEl);

            c.append(title);
            c.append(wrap);
            c.append(cancel);
            c.bindNav();

            _poll = setInterval(function () {
                proxyGet('/pair/status?code=' + encodeURIComponent(code), function (r) {
                    if (!r || !r.status) return;
                    if (r.status === 'ok' && (r.access_token || r.arl || r.token)) {
                        clearPoll();
                        if (r.access_token) Lampa.Storage.set(SKEY_OAUTH, String(r.access_token));
                        if (r.arl) Lampa.Storage.set(SKEY, String(r.arl));
                        if (r.token) Lampa.Storage.set(SKEY_TOKEN, String(r.token));
                        if (r.user_id) Lampa.Storage.set(SKEY_UID, String(r.user_id));
                        if (r.email) Lampa.Storage.set('deezer_email', String(r.email));
                        Lampa.Noty.show('Deezer: вход выполнен ✓');
                        Lampa.Activity.replace({ component: 'deezer_home', title: 'Deezer' });
                    } else if (r.status === 'error') {
                        clearPoll();
                        Lampa.Noty.show('Ошибка входа: ' + (r.error || 'error'));
                        renderLogin();
                    }
                }, function () {});
            }, 2000);
        }

        function renderLogin(autoQR) {
            clearPoll();
            var email = Lampa.Storage.get('deezer_email', '') || '';
            c.clear();
            var title = document.createElement('div');
            title.className = 'dz-sec';
            title.style.margin = '0 0 .4em';
            title.textContent = 'Вход Deezer';

            // Подсказка — QR рекомендуется
            var hint = document.createElement('div');
            hint.style.cssText = 'font-size:.82em;color:#888;margin-bottom:.9em;line-height:1.4;';
            hint.textContent = '📱 Рекомендуется: вход по QR (с телефона). Email/пароль работает если браузер TV поддерживает CORS.';
            c.append(title);
            c.append(hint);

            function row(label, val, onClick) {
                var d = document.createElement('div');
                d.className = 'dz-login-row selector';
                d.tabIndex = 0;
                d.innerHTML = '<span class="dz-lr-label">' + label + '</span>' +
                              '<span class="dz-lr-val">' + esc(val) + '</span>';
                bindAction(d, onClick);
                return d;
            }

            var emailRow = row('Email', email || '(нажмите для ввода)', function () {
                Lampa.Input.edit({ title: 'Email Deezer', value: Lampa.Storage.get('deezer_email', ''), nosave: true, free: true }, function (v) {
                    Lampa.Storage.set('deezer_email', v);
                    emailRow.querySelector('.dz-lr-val').textContent = v || '(нажмите для ввода)';
                });
            });

            var passRow = row('Пароль', _pass ? '••••••' : '(нажмите для ввода)', function () {
                Lampa.Input.edit({ title: 'Пароль Deezer', value: '', nosave: true, free: true, password: true }, function (v) {
                    // DO NOT trim password — spaces are valid
                    _pass = v;
                    passRow.querySelector('.dz-lr-val').textContent = _pass ? '•'.repeat(Math.min(_pass.length, 10)) : '(нажмите для ввода)';
                });
            });

            var loginBtn = document.createElement('div');
            loginBtn.className = 'dz-login-row dz-login-btn selector';
            loginBtn.tabIndex = 0;
            loginBtn.innerHTML = '▶ Войти';
            var doLogin = function () {
                if (!PROXY) { Lampa.Noty.show('Прокси не настроен'); return; }
                var em = _dzSGetTrim('deezer_email', '');
                if (!em || !_pass) { Lampa.Noty.show('Введи email и пароль'); return; }
                loginBtn.textContent = 'Вход…';
                deezerLogin(em, _pass, function (arl) {
                    if (typeof arl === 'string' && arl.length > 20) Lampa.Storage.set(SKEY, arl);
                    _pass = '';
                    Lampa.Noty.show('Deezer: вход выполнен ✓');
                    Lampa.Activity.replace({ component: 'deezer_home', title: 'Deezer' });
                }, function (err) {
                    loginBtn.textContent = '▶ Войти';
                    var s = String(err || '');
                    // Если все методы заблокированы — автоматически открываем QR
                    if (s.indexOf('QR') !== -1 || s.indexOf('заблокированы') !== -1 ||
                        s.indexOf('заблокирован') !== -1 || s.indexOf('blocked') !== -1) {
                        Lampa.Noty.show('Вход по паролю недоступен — открываю QR вход 📱');
                        setTimeout(function () { try { doQR(); } catch (e) {} }, 500);
                        return;
                    }
                    // Другая ошибка — показываем детали
                    Lampa.Noty.show('Ошибка: ' + s.slice(0, 120));
                    console.error('[DZ login]', err);
                });
            };
            bindAction(loginBtn, doLogin);

            var qrBtn = document.createElement('div');
            qrBtn.className = 'dz-login-row dz-login-btn selector';
            qrBtn.tabIndex = 0;
            qrBtn.innerHTML = '📱 Войти по QR';
            var doQR = function () {
                if (!PROXY) { Lampa.Noty.show('Прокси не настроен'); return; }
                qrBtn.textContent = 'Создание QR…';
                proxyGet('/pair/start', function (r) {
                    var code = r && r.code;
                    if (code) renderQR(code);
                    else { qrBtn.textContent = '📱 Войти по QR'; Lampa.Noty.show('Ошибка: нет кода'); }
                }, function (e) {
                    qrBtn.textContent = '📱 Войти по QR';
                    Lampa.Noty.show('Ошибка: ' + e);
                });
            };
            bindAction(qrBtn, doQR);

            var wrap = document.createElement('div');
            wrap.className = 'dz-login-wrap';
            wrap.appendChild(qrBtn);
            wrap.appendChild(emailRow);
            wrap.appendChild(passRow);
            wrap.appendChild(loginBtn);
            c.append(title);
            c.append(wrap);
            c.bindNav();
            if (autoQR) setTimeout(doQR, 50);
        }

        renderLogin(object && object.mode === 'qr');
    };
    this.start   = function () { c.registerController(this); Lampa.Controller.toggle('content'); };
    this.pause   = this.stop = function () {};
    this.render  = function () { return c.render(); };
    this.destroy = function () { _pass = ''; clearInterval(_poll); _poll = null; c.destroy(); };
}

/* ─── Bootstrap ──────────────────────────────────────────────────────────── */
function startPlugin(){
    injectCSS();

    // Register components
    Lampa.Component.add('deezer_login',    LoginComp);
    Lampa.Component.add('deezer_home',     HomeComp);
    Lampa.Component.add('deezer_search',   SearchComp);
    Lampa.Component.add('deezer_album',         AlbumComp);
    Lampa.Component.add('deezer_playlist',      PlaylistComp);
    Lampa.Component.add('deezer_artist',        ArtistComp);
    Lampa.Component.add('deezer_player_screen', DZPlayerScreenComp);

    // Register settings section — wrap in try/catch to diagnose crashes
    try {
        // Must register all 'input' type fields in Params to avoid update() crash
        Lampa.Params.select(SKEY,          '', '');
        Lampa.Params.select(SKEY_QUAL,     '', '');
        Lampa.Params.select('deezer_email', '', '');
        Lampa.Params.select('deezer_pass',  '', '');

        Lampa.SettingsApi.addComponent({
            component: 'deezer',
            name:      'Deezer',
            icon:      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z"/></svg>'
        });

        // Email — type:'static' + manual Input.edit, no Params.update() involvement
        Lampa.SettingsApi.addParam({
            component: 'deezer',
            param: {name:'deezer_email', type:'static'},
            field: {name:'Email Deezer'},
            onRender: function(item){
                var cur = Lampa.Storage.get('deezer_email','');
                if(cur) item.find('.settings-param__name').text('Email: '+cur);
                item.on('hover:enter', function(){
                    Lampa.Input.edit({
                        title: 'Email Deezer', value: Lampa.Storage.get('deezer_email',''),
                        nosave: true, free: true
                    }, function(v){
                        v = v.trim();
                        Lampa.Storage.set('deezer_email', v);
                        item.find('.settings-param__name').text(v ? 'Email: '+v : 'Email Deezer');
                    });
                });
            }
        });

        // Password — type:'static'
        Lampa.SettingsApi.addParam({
            component: 'deezer',
            param: {name:'deezer_pass', type:'static'},
            field: {name:'Пароль Deezer'},
            onRender: function(item){
                item.on('hover:enter', function(){
                    Lampa.Input.edit({
                        title: 'Пароль Deezer', value: '',
                        nosave: true, free: true, password: true
                    }, function(v){
                        Lampa.Storage.set('deezer_pass', String(v || ''));
                        item.find('.settings-param__name').text(v ? 'Пароль: ••••••' : 'Пароль Deezer');
                    });
                });
            }
        });

        Lampa.SettingsApi.addParam({
            component: 'deezer',
            param: {name:'deezer_quality_ui', type:'static'},
            field: {name:'Качество'},
            onRender: function(item){
                function upd(){
                    item.find('.settings-param__name').text('Качество: ' + qualityLabel(getQuality()));
                }
                upd();
                item.on('hover:enter', function(){
                    var cur = getQuality();
                    Lampa.Select.show({
                        title: 'Deezer — качество',
                        items: [
                            { title: (cur === 'AUTO' ? '✓ ' : '') + 'AUTO',      value: 'AUTO' },
                            { title: (cur === 'FLAC' ? '✓ ' : '') + 'FLAC',      value: 'FLAC' },
                            { title: (cur === 'MP3_320' ? '✓ ' : '') + 'MP3 320', value: 'MP3_320' },
                            { title: (cur === 'MP3_128' ? '✓ ' : '') + 'MP3 128', value: 'MP3_128' }
                        ],
                        onSelect: function(it){
                            DZPlayer.setQuality(it.value);
                            upd();
                        },
                        onBack: function(){}
                    });
                });
            }
        });

        // Login button
        Lampa.SettingsApi.addParam({
            component: 'deezer',
            param: {name:'deezer_do_login', type:'static'},
            field: {name:'▶ Войти через email + пароль'},
            onRender: function(item){
                item.on('hover:enter', function(){
                    if(!PROXY){ Lampa.Noty.show('Прокси не настроен'); return; }
                    var email=_dzSGetTrim('deezer_email','');
                    var pass =_dzSGet('deezer_pass','');
                    if(!email||!pass){ Lampa.Noty.show('Заполни Email и Пароль'); return; }
                    item.find('.settings-param__name').text('Вход...');
                    deezerLogin(email, pass, function(arl){
                        if (typeof arl === 'string' && arl.length > 20) Lampa.Storage.set(SKEY, arl);
                        Lampa.Storage.set('deezer_pass', '');
                        item.find('.settings-param__name').text('▶ Войти через email + пароль');
                        Lampa.Noty.show('Deezer: вход выполнен ✓');
                    }, function(err){
                        item.find('.settings-param__name').text('▶ Войти через email + пароль');
                        var s = String(err || '');
                        if (s.indexOf('QR') !== -1 || s.indexOf('заблокированы') !== -1 || s.indexOf('blocked') !== -1) {
                            Lampa.Noty.show('Вход по паролю недоступен. Используй QR-вход 📱');
                        } else {
                            Lampa.Noty.show('Ошибка: ' + s.slice(0, 120));
                        }
                    });
                });
            }
        });
        Lampa.SettingsApi.addParam({
            component: 'deezer',
            param: {name:'deezer_do_qr', type:'static'},
            field: {name:'📱 Войти по QR-коду'},
            onRender: function(item){
                item.on('hover:enter', function(){
                    if(!PROXY){ Lampa.Noty.show('Прокси не настроен'); return; }
                    Lampa.Controller.toggle('content');
                    Lampa.Activity.push({component:'deezer_login', title:'Deezer', mode:'qr'});
                });
            }
        });

        // Open / Logout
        Lampa.SettingsApi.addParam({
            component: 'deezer',
            param: {name:'deezer_open', type:'static'},
            field: {name:'Открыть Deezer'},
            onRender: function(item){
                item.on('hover:enter', function(){
                    Lampa.Controller.toggle('content');
                    var arl = _dzSGetTrim(SKEY,'');
                    var oauth = _dzSGetTrim(SKEY_OAUTH,'');
                    Lampa.Activity.push({component: (arl || oauth) ? 'deezer_home' : 'deezer_login', title:'Deezer'});
                });
            }
        });
        Lampa.SettingsApi.addParam({
            component: 'deezer',
            param: {name:'deezer_logout', type:'static'},
            field: {name:'Выйти из Deezer'},
            onRender: function(item){
                item.on('hover:enter', function(){
                    Lampa.Storage.set(SKEY,''); Lampa.Storage.set(SKEY_OAUTH,''); Lampa.Storage.set('deezer_email',''); Lampa.Storage.set('deezer_pass','');
                    Lampa.Noty.show('Deezer: выход выполнен');
                    item.find('.settings-param__name').text('Выйти из Deezer');
                });
            }
        });
    } catch(e) {
        console.error('[Deezer] Settings registration error:', e.message, e.stack);
    }

    // Add menu button
    Lampa.Listener.follow('menu',function(e){
        if(e.type !== 'start') return;
        var icon='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z"/></svg>';
        Lampa.Menu.addButton(icon, 'Deezer', function(){
                var arl=_dzSGetTrim(SKEY,'');
                var oauth=_dzSGetTrim(SKEY_OAUTH,'');
                Lampa.Activity.push({component: (arl||oauth)?'deezer_home':'deezer_login', title:'Deezer'});
        });
    });

    console.log('[Deezer plugin] ready');
}

// Wait for Lampa to fully initialize
if(window.Lampa&&Lampa.Listener&&Lampa.Component&&Lampa.SettingsApi){
    startPlugin();
}else{
    var _dz=setInterval(function(){
        if(window.Lampa&&Lampa.Listener&&Lampa.Component&&Lampa.SettingsApi){
            clearInterval(_dz);startPlugin();
        }
    },100);
}

}()); // end IIFE
