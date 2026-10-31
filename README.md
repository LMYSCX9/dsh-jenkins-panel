# dsh-jenkins

DSH锛圖eepSeek Harness锛夌殑 Jenkins 鎻掍欢锛氬乏渚ф爮鍏ュ彛 + 闈㈡澘锛岀敤鏉ヨ繛鎺?Jenkins銆佹煡璇换鍔°€佽Е鍙戞瀯寤恒€佹煡鐪嬮槦鍒楋紱鍚屾牱鐨勮兘鍔涘悓鏃朵互 6 涓?Agent 宸ュ叿鏆撮湶缁欐ā鍨嬨€傛敮鎸佸悓鏃堕厤缃涓?Jenkins 鏈嶅姟鍣ㄣ€?
闆惰繍琛屾椂渚濊禆锛堝彧鐢?Node 鍐呯疆妯″潡锛夛紝绾?ESM锛屾棤鏋勫缓姝ラ銆?
## 鑳藉姏

闈㈡澘锛堝乏渚ф爮 鈫?榻胯疆鍥炬爣锛屾帓鍦?Plugins / Schedules 涔嬪悗锛夛細

- **澶氳繛鎺?*锛氬彲閰嶇疆澶氫釜 Jenkins 鏈嶅姟鍣紙渚嬪銆屽叕鍙告満鎴裤€嶃€屾祴璇曠幆澧冦€嶏級锛岄潰鏉块《閮ㄤ笅鎷夊垏鎹€佸彲鏂板涓庡垹闄わ紱鏂板缓鐨勮繛鎺ヨ嚜鍔ㄦ垚涓哄綋鍓嶈繛鎺ャ€傞潰鏉垮拰鎵€鏈夊伐鍏烽粯璁ゆ寜銆屽綋鍓嶈繛鎺ャ€嶅伐浣滐紝涔熷彲浠ユ寜鍚嶅瓧鎴?id 鎸囧畾鏌愪竴涓繛鎺ャ€?- **杩炴帴璁剧疆**锛氬悕绉般€佸湴鍧€銆佺敤鎴峰悕銆丄PI Token銆佹槸鍚︿俊浠昏嚜绛惧悕璇佷功銆佷换鍔¤繃婊わ紱銆屼繚瀛樺苟杩炴帴銆嶄細淇濆瓨 鈫?娴嬮€?鈫?鎷夊垪琛紝澶辫触鐩存帴鍥炴樉鍘熷洜銆?- **浠诲姟鍒楄〃**锛氶€掑綊灞曞紑鏂囦欢澶癸紝鏄剧ず涓?`folder/job`锛涚姸鎬佺偣銆佷笂娆℃瀯寤哄彿銆佺粨鏋溿€佺浉瀵规椂闂淬€佽€楁椂锛涙敮鎸佹悳绱€?- **瑙﹀彂鏋勫缓**锛氭瘡琛屻€屾瀯寤恒€嶆寜閽紝鑷姩鑾峰彇 CSRF crumb锛岃繑鍥?Jenkins 闃熷垪鍦板潃锛涙彁浜ゅ悗 4 绉掕嚜鍔ㄥ埛鏂般€傚弬鏁板寲浠诲姟**鎸夊悇鍙傛暟鐨勯粯璁ゅ€兼瀯寤?*鈥斺€斿厛璇?`parameterDefinitions`锛屽彧鎻愪氦鏈夐粯璁ゅ€肩殑鍙傛暟锛屼笉闇€瑕佸～琛ㄣ€?- **鏋勫缓鍘嗗彶**锛氭瘡琛屻€屽巻鍙层€嶅睍寮€鏈€杩?8 娆℃瀯寤恒€?- **鏋勫缓闃熷垪**锛氭帓闃熼」涓庣瓑寰呭師鍥犮€?- **浼氳瘽椤靛揩鎹烽€夋嫨鍣?*锛氬湪 Hero 鐣岄潰銆屽伐浣滃尯 / 妯″紡銆嶉偅涓€琛岀殑鍙充晶鏈変竴涓€孞enkins 浠诲姟銆嶈兌鍥婏紝鐐瑰紑鍗充换鍔″垪琛紙甯︽悳绱級锛岄€変腑鍚庨渶鍐嶆寜 鈻?鎵嶈Е鍙戞瀯寤猴紝閬垮厤璇偣銆?
Agent 宸ュ叿锛堜笌闈㈡澘鍏辩敤鍚屼竴濂?Host 浠ｇ爜锛夛細

| 宸ュ叿 | 浣滅敤 |
|---|---|
| `jenkins_connections` | 鍒楀嚭鎵€鏈夎繛鎺ワ紙id / 鍚嶇О / 鍦板潃 / 鏄惁宸插瓨 Token锛変笌褰撳墠杩炴帴 |
| `jenkins_configure` | 鏂板鎴栨洿鏂颁竴涓繛鎺ュ苟绔嬪嵆娴嬮€氾紱浼?`connection` 鏀瑰凡鏈夌殑锛屽彧浼?`name` 鍒欐柊寤?|
| `jenkins_list_jobs` | 鍒楀嚭浠诲姟锛堝惈鏂囦欢澶瑰唴浠诲姟锛変笌涓婃鏋勫缓 |
| `jenkins_build` | 瑙﹀彂鏋勫缓锛涘弬鏁板寲浠诲姟鎸夊０鏄庨粯璁ゅ€兼瀯寤猴紝鍙敤 `params` 瑕嗙洊 |
| `jenkins_builds` | 鏌ョ湅鏌愪换鍔℃渶杩戣嫢骞叉鏋勫缓 |
| `jenkins_queue` | 鏌ョ湅鏋勫缓闃熷垪 |

闄?`jenkins_connections` / `jenkins_configure` 澶栵紝鍏朵綑宸ュ叿閮芥帴鍙楀彲閫夌殑 `connection` 鍙傛暟锛堣繛鎺?id 鎴栧悕绉帮級锛岀渷鐣ユ椂浣跨敤褰撳墠杩炴帴銆?
Host 渚ч€氳繃鍓嶇紑璺敱 `/dsh-jenkins` 鎻愪緵鍚屾牱鐨勬搷浣滐紝闈㈡澘涓庡伐鍏疯皟鐢ㄧ殑鏄悓涓€鎵瑰嚱鏁帮紝涓嶅瓨鍦ㄤ袱浠藉疄鐜般€?
## 鏇存柊

闈㈡澘鏍囬涓嬫柟鏈?`v1.4.0 路 妫€鏌ユ洿鏂癭 涓€琛岋紝鎻掍欢鍙互鑷繁妫€鏌ュ苟瀹夎鏂扮増鏈紝涓嶄緷璧栥€屾彃浠剁鐞嗐€嶉〉闈細

- **npm 瀹夎**锛氫細鍚戝凡閰嶇疆鐨?registry 鏌ヨ鏈彃浠剁殑鏈€鏂扮増鏈紱鍙戠幇鏇存柊鏃跺嚭鐜般€屾洿鏂板埌 x.y.z銆嶏紝鐐逛竴涓嬪氨鐢?DSH 鎻掍欢绠＄悊鍣ㄥ畬鎴愬畨瑁咃紙涓?`install_plugin` 鍚屼竴鏉?pnpm 璺緞锛夛紝骞舵彁绀烘槸鍚﹂渶瑕侀噸鍚?DSH锛?- **鏈湴鐩綍瀹夎**锛氫笉鑷姩鏇存柊锛屼細鐩存帴璇存槑鍘熷洜锛堟敼婧愮爜鍚庨噸鏂板畨瑁呭嵆鍙級锛?- **git 瀹夎**锛氫笉鑷姩鏇存柊锛岄渶瑕佹崲鏂扮殑 ref锛屾垨鏀圭敤 npm 鍙戝竷鍚庤嚜鍔ㄦ洿鏂般€?
浠讳綍瀹夎閮藉彧鍦?*浣犵偣鍑绘椂**鍙戠敓锛屼笉鍋氶潤榛樺崌绾с€?
## 瀹夎

浠婚€変竴绉嶏紝鐩爣閮芥槸浜ょ粰 DSH 鐨?Plugin Manager锛坄install_bundle`锛夛細

```text
# npm
dsh-jenkins-panel@1.4.1

# git锛堟帹鑽愰拤 commit锛屼笉瑕佺敤鍒嗘敮鍚嶏級
git+https://github.com/LMYSCX9/dsh-jenkins-panel.git#<commit-sha>

# 鏈湴鐩綍
<鏈湴璺緞>/dsh-plugin-jenkins
```

瑁呭畬鍦?DSH Web 宸︽爮鍑虹幇涓€涓娇杞浘鏍囷紝鐐瑰紑鍗抽潰鏉裤€?
## 閰嶇疆

鍦ㄩ潰鏉块噷鏂板/缂栬緫杩炴帴鍗冲彲锛屼篃鍙互鍦?`cordis.patch.yml` 鐨?`jenkins` 琛岀粰鍒濆€硷紙闈㈡澘淇濆瓨鐨勫€间紭鍏堬級銆傛瘡涓繛鎺ラ兘鏈夊悓鏍风殑瀛楁锛?
| 瀛楁 | 璇存槑 |
|---|---|
| `name` | 杩炴帴鍚嶇О锛屼箣鍚庣敤瀹冩潵鎸囧畾杩炴帴锛屽銆屽叕鍙告満鎴裤€?|
| `baseUrl` | Jenkins 鏍瑰湴鍧€锛屽 `http://ci.example.com:8080` 鎴?`http://host/jenkins` |
| `username` | Jenkins 璐﹀彿 |
| `token` | API Token锛圝enkins 鈫?鐢ㄦ埛璁剧疆 鈫?API Token锛?|
| `insecureTls` | 鏄惁璺宠繃 HTTPS 璇佷功鏍￠獙锛?*榛樿 `true`**锛屼娇鐢ㄦ瑙勮瘉涔︽椂璇峰彇娑堝嬀閫?|
| `jobFilter` | 鍙樉绀哄悕绉板寘鍚鏂囨湰鐨勪换鍔★紝鐣欑┖涓哄叏閮?|

淇濆瓨浣嶇疆锛歚~/.dsh/jenkins/settings.json`锛堟潈闄?`0600`锛夛紝鍙敤鐜鍙橀噺 `DSH_JENKINS_SETTINGS` 瑕嗙洊璺緞銆傛枃浠剁粨鏋勬槸 `{ version: 2, activeId, connections: [...] }`锛涙棫鐗堢殑鍗曡繛鎺ユ枃浠朵細鍦ㄥ惎鍔ㄦ椂鑷姩杩佺Щ鎴愪竴鏉¤繛鎺ャ€傚嚟鎹笉杩?`cordis.patch.yml`銆?
## 瀹夊叏杈圭晫

- Token **鍙啓涓嶈**锛氫换浣曟帴鍙ｅ彧杩斿洖 `hasToken: true/false`锛屼笉鍥炴樉鍐呭锛屼篃涓嶈繘浼氳瘽涓婁笅鏂囥€?- `/dsh-jenkins` 璺敱**鍙帴鍙楁湰鏈猴紙loopback锛夎姹?*锛岄潪鏈満鏉ユ簮鐩存帴 403銆?- 璇锋眰鐗规€э細`insecureTls` 鎵撳紑鏃舵帴鍙楄嚜绛惧悕璇佷功锛岄€傜敤浜庡唴缃?Jenkins锛涘叧闂椂鎸?Node 榛樿绛栫暐鏍￠獙璇佷功銆?
## 鍏煎鎬?
- 鍦?DSH `0.2.1-rc.5`锛圵indows锛學eb GUI锛変笂寮€鍙戜笌楠岃瘉銆?- 闇€瑕?profile 閲屾寕杞戒簡 `webServer` 涓?`tools`锛涢潰鏉块渶瑕?Client 渚х殑 `slots` 涓?`locale` 鏈嶅姟銆?- Node 18+锛堜娇鐢?`node:http` / `node:https` / 鍐呯疆 `fetch` 涔嬪鐨?API 鍧囦负闀挎湡绋冲畾鎺ュ彛锛夈€?
## 寮€鍙?
```
.
鈹溾攢 package.json         娓呭崟锛歟xports / dsh.bundle / dsh.client
鈹溾攢 cordis.patch.yml     鎻掑叆 jenkins 琛?鈹溾攢 index.js             Host 鍗婏細Jenkins 瀹㈡埛绔?+ /dsh-jenkins 璺敱 + 5 涓伐鍏?鈹溾攢 client.js            Client 鍗婏細渚ф爮鍥炬爣 + 涓婚潰鏉匡紙React锛屾棤 JSX 鏋勫缓锛?鈹溾攢 icon.svg             鎻掍欢鍥炬爣
鈹斺攢 locale/{en,zh}.json  meta.title / meta.description
```

- 璇硶鑷锛歚node --check index.js && node --check client.js`
- 鎵撳寘鍐呭鑷锛歚npm pack --dry-run`锛坄files` 鐧藉悕鍗曪紝鍙簲鍖呭惈涓婅〃 7 涓枃浠讹級

娉ㄦ剰锛氬寘鍚嶅悓鏃舵槸 Client 妯″潡 id锛屾敼鍚嶅繀椤诲悓姝ユ敼 **package.json 鐨?`name`**銆?*client.js 閲?`window.__ModuleLoader__.load({ id })`**銆?*cordis.patch.yml 鐨?`name`** 涓夊锛屽皯涓€澶勫氨璧蜂笉鏉ャ€?
## English

A Jenkins plugin for DeepSeek Harness: a left-sidebar panel plus five agent tools (`jenkins_configure`, `jenkins_list_jobs`, `jenkins_build`, `jenkins_builds`, `jenkins_queue`).

Connect a Jenkins server, browse jobs (folders flattened), inspect build history and the build queue, and trigger builds 鈥?with CSRF crumb handling and a returned queue URL. Both the panel and the tools call the same Host functions behind a loopback-only `/dsh-jenkins` route.

No runtime dependencies, no build step. Credentials live in `~/.dsh/jenkins/settings.json` (mode `0600`, override with `DSH_JENKINS_SETTINGS`) and the token is never echoed back. TLS verification is skipped by default for self-signed intranet servers; untick 鈥渢rust self-signed certificates鈥?to enable it.

Verified on DSH 0.2.1-rc.5.

## License

MIT
