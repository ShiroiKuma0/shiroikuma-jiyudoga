import { createApp } from 'vue'
import i18n from './i18n/index'
import router from './router/index'
import store from './store/index'
import App from './App.vue'
import { showExternalPlayerUnsupportedActionToast, showToast } from './helpers/utils'
import { library } from './fontawesome-minimal'
// import the styles
import '@fortawesome/fontawesome-svg-core/styles.css'
// 白い熊 自由動画: the black-yellow look of every stock widget, drawn from the theme's roles
import './skui-theme.css'

import { register as registerSwiper } from 'swiper/element'

// Please keep the list of constants sorted by name
// to avoid code conflict and duplicate entries
import {
  faAngleDown,
  faAngleLeft,
  faAngleUp,
  faArrowDown,
  faArrowDownShortWide,
  faArrowDownWideShort,
  faArrowLeft,
  faArrowRight,
  faArrowUp,
  faArrowUpRightFromSquare,
  faBan,
  faBars,
  faBarsProgress,
  faBorderAll,
  faBookmark,
  faCalendarDays,
  faCheck,
  faChevronLeft,
  faChevronRight,
  faCircleExclamation,
  faCirclePlay,
  faCircleUser,
  faClapperboard,
  faCircleXmark,
  faClock,
  faClockRotateLeft,
  faClone,
  faComment,
  faCompass,
  faCookieBite,
  faCopy,
  faDatabase,
  faDisplay,
  faDownload,
  faEdit,
  faEllipsisH,
  faEllipsisV,
  faEnvelope,
  faExchangeAlt,
  faExclamationCircle,
  faExpand,
  faExternalLinkAlt,
  faEye,
  faEyeSlash,
  faFileDownload,
  faFileExport,
  faFileImage,
  faFileLines,
  faFileVideo,
  faFilm,
  faFilter,
  faFilterCircleXmark,
  faFlask,
  faFire,
  faFont,
  faForward,
  faGamepad,
  faGauge,
  faGlobe,
  faGraduationCap,
  faGrip,
  faHardDrive,
  faHashtag,
  faHeart,
  faHistory,
  faImages,
  faInfoCircle,
  faKey,
  faKeyboard,
  faLanguage,
  faLink,
  faLinkSlash,
  faList,
  faLocationDot,
  faMapPin,
  faMicrochip,
  faLock,
  faMessage,
  faMobileScreen,
  faMoneyCheckDollar,
  faMusic,
  faNetworkWired,
  faPalette,
  faPhotoFilm,
  faPlay,
  faPlug,
  faPlus,
  faPodcast,
  faPowerOff,
  faQuestionCircle,
  faRandom,
  faRetweet,
  faRobot,
  faRotateLeft,
  faRotateRight,
  faRss,
  faRulerHorizontal,
  faSatelliteDish,
  faSave,
  faSearch,
  faSeedling,
  faServer,
  faShareAlt,
  faShield,
  faSlash,
  faSlidersH,
  faSortAlphaDown,
  faSortAlphaDownAlt,
  faSortDown,
  faStar,
  faStepBackward,
  faStepForward,
  faSync,
  faTableColumns,
  faTerminal,
  faThumbsDown,
  faThumbsUp,
  faThumbtack,
  faTimes,
  faTimesCircle,
  faTowerBroadcast,
  faTrash,
  faTriangleExclamation,
  faTrophy,
  faTv,
  faUnlock,
  faUserCheck,
  faUserLock,
  faUserSlash,
  faUsers,
  faUsersSlash,
  faVideo,
  faVolumeHigh,
  faVolumeLow,
  faVolumeMute,
  faWifi,
  faWindowMaximize,
  faXmark
} from '@fortawesome/free-solid-svg-icons'
import {
  faBookmark as farBookmark,
  faDotCircle as farDotCircle,
  faStar as farStar
} from '@fortawesome/free-regular-svg-icons'
import {
  faBitcoin,
  faGithub,
  faMastodon,
  faMatrix,
} from '@fortawesome/free-brands-svg-icons'
import { FontAwesomeIcon, FontAwesomeLayers } from '@fortawesome/vue-fontawesome'

// Please keep the list of constants sorted by name
// to avoid code conflict and duplicate entries
library.add(
  // solid icons
  faAngleDown,
  faAngleLeft,
  faAngleUp,
  faArrowDown,
  faArrowDownShortWide,
  faArrowDownWideShort,
  faArrowLeft,
  faArrowRight,
  faArrowUp,
  faArrowUpRightFromSquare,
  faBan,
  faBars,
  faBarsProgress,
  faBorderAll,
  faBookmark,
  faCalendarDays,
  faCheck,
  faChevronLeft,
  faChevronRight,
  faCircleExclamation,
  faCirclePlay,
  faCircleUser,
  faClapperboard,
  faCircleXmark,
  faClock,
  faClockRotateLeft,
  faClone,
  faComment,
  faCompass,
  faCookieBite,
  faCopy,
  faDatabase,
  faDisplay,
  faDownload,
  faEdit,
  faEllipsisH,
  faEllipsisV,
  faEnvelope,
  faExchangeAlt,
  faExclamationCircle,
  faExpand,
  faExternalLinkAlt,
  faEye,
  faEyeSlash,
  faFileDownload,
  faFileExport,
  faFileImage,
  faFileLines,
  faFileVideo,
  faFilm,
  faFilter,
  faFilterCircleXmark,
  faFlask,
  faFire,
  faFont,
  faForward,
  faGamepad,
  faGauge,
  faGlobe,
  faGraduationCap,
  faGrip,
  faHardDrive,
  faHashtag,
  faHeart,
  faHistory,
  faImages,
  faInfoCircle,
  faKey,
  faKeyboard,
  faLanguage,
  faLink,
  faLinkSlash,
  faList,
  faLocationDot,
  faMapPin,
  faMicrochip,
  faLock,
  faMessage,
  faMobileScreen,
  faMoneyCheckDollar,
  faMusic,
  faNetworkWired,
  faPalette,
  faPhotoFilm,
  faPlay,
  faPlug,
  faPlus,
  faPhotoFilm,
  faPodcast,
  faPowerOff,
  faQuestionCircle,
  faRandom,
  faRetweet,
  faRobot,
  faRotateLeft,
  faRotateRight,
  faRss,
  faRulerHorizontal,
  faSatelliteDish,
  faSave,
  faSearch,
  faSeedling,
  faServer,
  faShareAlt,
  faShield,
  faSlash,
  faSlidersH,
  faSortAlphaDown,
  faSortAlphaDownAlt,
  faSortDown,
  faStar,
  faStepBackward,
  faStepForward,
  faSync,
  faTableColumns,
  faTerminal,
  faThumbsDown,
  faThumbsUp,
  faThumbtack,
  faTimes,
  faTimesCircle,
  faTowerBroadcast,
  faTrash,
  faTriangleExclamation,
  faTrophy,
  faTv,
  faUnlock,
  faUserCheck,
  faUserLock,
  faUserSlash,
  faUsers,
  faUsersSlash,
  faVideo,
  faVolumeHigh,
  faVolumeLow,
  faVolumeMute,
  faWifi,
  faWindowMaximize,
  faXmark,

  // solid icons
  farBookmark,
  farDotCircle,
  farStar,

  // brand icons
  faGithub,
  faBitcoin,
  faMastodon,
  faMatrix,
)

registerSwiper()

const app = createApp(App)

app.config.performance = process.env.NODE_ENV === 'development'

app
  .component('FontAwesomeIcon', FontAwesomeIcon)
  .component('FontAwesomeLayers', FontAwesomeLayers)

  .use(router)
  .use(store)
  .use(i18n)

router.isReady().then(() => {
  app.mount('#app')
})

// to avoid accessing electron api from web app build
if (process.env.IS_ELECTRON) {
  window.ftElectron.handleChangeView((route) => {
    router.push(route)
  })

  window.ftElectron.handleOpenInExternalPlayerResult(
    (externalPlayer, unsupportedActions, isPlaylist) => {
      for (const action of unsupportedActions) {
        showExternalPlayerUnsupportedActionToast(externalPlayer, action)
      }

      const videoOrPlaylist = isPlaylist
        ? i18n.global.t('Video.External Player.playlist')
        : i18n.global.t('Video.External Player.video')

      showToast(i18n.global.t('Video.External Player.OpeningTemplate', { videoOrPlaylist, externalPlayer }))
    }
  )
}
