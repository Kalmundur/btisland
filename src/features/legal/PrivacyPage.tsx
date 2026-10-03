import { useTranslation } from 'react-i18next';
import { PageHeader } from '../../components/PageHeader';
import { APP_NAME } from '../../config/app';

/**
 * /personuvernd (alias /privacy) – the public privacy policy linked from the app stores.
 * Kept as plain content in both languages; update LAST_UPDATED when the text changes.
 */
const CONTACT_EMAIL = 'Karl.Andersson.Claesson@gmail.com';
const OPERATOR = 'Karl Andersson Claesson';
const LAST_UPDATED = { is: '3. október 2026', en: '3 October 2026' };

interface Section {
  id?: string;
  title: string;
  body: Array<string | string[]>; // string = paragraph, string[] = bullet list
}

const content: Record<'is' | 'en', { title: string; intro: string; sections: Section[] }> = {
  is: {
    title: 'Persónuverndarstefna',
    intro: `${APP_NAME} er app fyrir leikskýrslur, úrslit og stöðu í deildarkeppni í borðtennis. Hér kemur fram hvaða upplýsingar appið vinnur með, í hvaða tilgangi og hvaða rétt þú átt.`,
    sections: [
      {
        title: 'Ábyrgðaraðili',
        body: [`${APP_NAME} er rekið af ${OPERATOR}. Fyrirspurnir um persónuvernd: ${CONTACT_EMAIL}.`],
      },
      {
        title: 'Upplýsingar sem unnið er með',
        body: [
          [
            'Nafnlaust auðkenni tækis: þegar appið er opnað í fyrsta sinn er búið til nafnlaust auðkenni sem tengir tækið við þjónustuna. Ekki er beðið um nafn, netfang eða lykilorð.',
            'Val á leikmanni: þegar þú velur nafnið þitt úr leikmannaskrá deildarinnar („Þetta er ég“) er tækið tengt þeim leikmanni. Nöfn leikmanna, félög og lið koma úr opinberri leikmannaskrá deildarinnar.',
            'Þátttaka í umferð: þegar þú tengist umferð með kóða frá mótshaldara er skráð hvaða leikmaður, lið og viðureign tækið tengist.',
            'Leikskýrslur: uppstillingar, tvíliðapör, skráðar lotur og staðfestingar á úrslitum eru vistaðar ásamt upplýsingum um hvaða leikmaður skráði þær.',
            'Mótshaldarar: aðgangur mótshaldara byggir á netfangi og lykilorði. Lykilorð eru geymd dulkóðuð (hashed). Aðgerðir mótshaldara eru skráðar í aðgerðaskrá.',
            'Á tækinu sjálfu: valinn leikmaður, tungumál, innskráningartákn og lotur sem bíða samstillingar þegar engin nettenging er.',
          ],
        ],
      },
      {
        title: 'Hvað er birt opinberlega',
        body: [
          'Úrslit staðfestra viðureigna, stöðutafla, topplisti og síður liða og leikmanna (nafn, lið og árangur í leikjum) eru aðgengileg öllum, í appinu og á vefnum. Það er tilgangur appsins: að birta úrslit deildarkeppninnar.',
        ],
      },
      {
        title: 'Það sem appið gerir ekki',
        body: [
          [
            'Engar auglýsingar og engin auglýsingarakning.',
            'Engin greiningartól (analytics) frá þriðja aðila.',
            'Engin staðsetning, tengiliðir, myndir eða hljóðnemi.',
            'Upplýsingar eru hvorki seldar né afhentar þriðja aðila til eigin nota.',
          ],
        ],
      },
      {
        title: 'Tilgangur og heimild',
        body: [
          'Upplýsingarnar eru notaðar eingöngu til að halda utan um leikskýrslur, staðfesta úrslit og birta úrslit og stöðu deildarinnar. Vinnslan byggir á lögmætum hagsmunum af því að halda utan um og birta úrslit keppninnar, sbr. lög nr. 90/2018 um persónuvernd og vinnslu persónuupplýsinga.',
        ],
      },
      {
        title: 'Vinnsluaðilar',
        body: [
          [
            'Supabase: gagnagrunnur, innskráning og rauntímauppfærslur.',
            'Vercel: hýsing vefsins. Þjónninn getur skráð tæknilegar upplýsingar á borð við IP-tölu í kerfisskrár.',
            'Google Play og Apple App Store: dreifing appsins samkvæmt þeirra eigin skilmálum.',
          ],
          'Öll samskipti milli appsins og þjónanna eru dulkóðuð (HTTPS).',
        ],
      },
      {
        title: 'Varðveisla',
        body: [
          'Úrslit og leikskýrslur eru varðveitt sem hluti af sögu deildarkeppninnar. Tenging tækis við leikmann og umferðir er fjarlægð þegar þú velur „Skrá út“ í stillingum appsins.',
        ],
      },
      {
        id: 'eyda-gognum',
        title: 'Réttindi þín og eyðing gagna',
        body: [
          `Þú getur óskað eftir aðgangi að upplýsingum um þig, leiðréttingu eða eyðingu með því að senda tölvupóst á ${CONTACT_EMAIL}. Tengingu tækisins við leikmann getur þú sjálf(ur) fjarlægt með „Skrá út“ í stillingum. Ósk um eyðingu aðgangs mótshaldara er afgreidd með sama hætti.`,
          'Staðfest úrslit leikja kunna að verða varðveitt áfram sem hluti af opinberum úrslitum deildarinnar.',
          'Þú getur einnig kvartað til Persónuverndar (personuvernd.is).',
        ],
      },
      {
        title: 'Börn',
        body: ['Appið er ekki ætlað börnum yngri en 13 ára.'],
      },
      {
        title: 'Breytingar',
        body: ['Stefnan kann að verða uppfærð. Dagsetning síðustu breytingar kemur fram hér að neðan.'],
      },
    ],
  },
  en: {
    title: 'Privacy policy',
    intro: `${APP_NAME} is an app for scorecards, results and standings in a table tennis league. This page explains what information the app processes, why, and what rights you have.`,
    sections: [
      {
        title: 'Who is responsible',
        body: [`${APP_NAME} is operated by ${OPERATOR}. Privacy questions: ${CONTACT_EMAIL}.`],
      },
      {
        title: 'Information processed',
        body: [
          [
            'Anonymous device identifier: the first time the app is opened, an anonymous identifier is created to connect the device to the service. No name, email or password is asked for.',
            "Player selection: when you pick your name from the league's player register (\"Þetta er ég\"), the device is linked to that player. Player names, clubs and teams come from the league's public player register.",
            'Round participation: when you join a round with a code from the organizer, the player, team and match the device is linked to are recorded.',
            'Scorecards: lineups, doubles pairs, entered games and result confirmations are stored together with which player entered them.',
            'Organizers: organizer access uses an email address and password. Passwords are stored hashed. Organizer actions are recorded in an audit log.',
            'On the device itself: the selected player, language, sign-in token and games waiting to sync while offline.',
          ],
        ],
      },
      {
        title: 'What is public',
        body: [
          'Results of confirmed matches, the league table, the top players list and team and player pages (name, team and match results) are visible to everyone, in the app and on the web. That is the purpose of the app: publishing the league results.',
        ],
      },
      {
        title: 'What the app does not do',
        body: [
          [
            'No ads and no ad tracking.',
            'No third-party analytics.',
            'No location, contacts, photos or microphone.',
            'Information is not sold or given to third parties for their own use.',
          ],
        ],
      },
      {
        title: 'Purpose and legal basis',
        body: [
          'The information is used only to keep scorecards, confirm results and publish the league results and standings. The processing is based on the legitimate interest in recording and publishing the competition results, under the Icelandic Act No. 90/2018 on data protection.',
        ],
      },
      {
        title: 'Service providers',
        body: [
          [
            'Supabase: database, sign-in and live updates.',
            'Vercel: web hosting. The server may record technical information such as IP addresses in system logs.',
            'Google Play and the Apple App Store: distribution of the app under their own terms.',
          ],
          'All communication between the app and the servers is encrypted (HTTPS).',
        ],
      },
      {
        title: 'Retention',
        body: [
          'Results and scorecards are kept as part of the league history. The link between a device and a player and its rounds is removed when you choose "Skrá út" (Log out) in the app settings.',
        ],
      },
      {
        id: 'eyda-gognum',
        title: 'Your rights and deleting data',
        body: [
          `You can request access to, correction of or deletion of information about you by emailing ${CONTACT_EMAIL}. You can remove the link between your device and a player yourself with "Skrá út" (Log out) in the settings. Requests to delete an organizer account are handled the same way.`,
          'Confirmed match results may be kept as part of the official league results.',
          'You can also complain to the Icelandic Data Protection Authority (personuvernd.is).',
        ],
      },
      {
        title: 'Children',
        body: ['The app is not directed at children under 13.'],
      },
      {
        title: 'Changes',
        body: ['This policy may be updated. The date of the last change is shown below.'],
      },
    ],
  },
};

export function PrivacyPage() {
  const { i18n } = useTranslation();
  const lang = i18n.language === 'en' ? 'en' : 'is';
  const c = content[lang];
  return (
    <>
      <PageHeader title={c.title} back backTo="/settings" />
      <div className="page prose">
        <p className="lead">{c.intro}</p>
        {c.sections.map((s) => (
          <section key={s.title} id={s.id} className="prose__section">
            <h2 className="section__title">{s.title}</h2>
            {s.body.map((b, i) =>
              typeof b === 'string' ? (
                <p key={i}>{b}</p>
              ) : (
                <ul key={i}>
                  {b.map((li) => (
                    <li key={li}>{li}</li>
                  ))}
                </ul>
              ),
            )}
          </section>
        ))}
        <p className="note">
          {lang === 'is' ? 'Síðast uppfært' : 'Last updated'}: {LAST_UPDATED[lang]}
        </p>
      </div>
    </>
  );
}
