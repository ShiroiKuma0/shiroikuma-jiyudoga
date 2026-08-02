import java.util.Properties

class VersionInfo {
  val appId: String
  val version: String
  val versionCode: Int
  constructor(givenId: String, givenVersion: String, givenCode: Int) {
    appId = givenId
    version = givenVersion
    versionCode = givenCode
  }
}

// Fork versioning (shiroikuma-jiyudoga):
//   FORK_VERSION <maj>.<min>.<patch>[.<respin>] — the higher of our two upstreams (see
//   fork.properties). The optional fourth component is FreeTubeAndroid's packaging respin
//   of the same FreeTube base.
//   versionName = "<FORK_VERSION>+<BUILD_NUMBER>", counter zero-padded to three digits
//                 (global rule: artifact lists sort in build order)
//   baseCode    = (maj*10000 + min*100 + patch) * 10 + respin
//   versionCode = baseCode * 1000 + BUILD_NUMBER
//                 (0.25.1+039 -> 25010039, 0.25.1.1+001 -> 25011001)
//   The respin gets its own digit so versionCode still RISES across a respin bump even
//   though BUILD_NUMBER resets to 1 on every FORK_VERSION change; the counter's slot is
//   three digits, which it already was in every name. Codes shipped under the previous
//   formula reproduce unchanged (respin 0, counter <= 999).
// FORK_VERSION and BUILD_NUMBER live in the repo-root fork.properties (shared with the deb
// build); BUILD_NUMBER is bumped by _scripts/build-fork.sh.
fun getVersionInfo(project: Project): VersionInfo {
  val forkProperties = Properties().apply {
    project.file("../../fork.properties").inputStream().use { load(it) }
  }

  val forkVersion = forkProperties.getProperty("FORK_VERSION").split("-")[0]
  val numbers = forkVersion.split(".")
  val major = numbers[0].toInt()
  val minor = numbers[1].toInt()
  val patch = numbers[2].toInt()
  val respin = numbers.getOrNull(3)?.toIntOrNull() ?: 0

  val buildNumber = forkProperties.getProperty("BUILD_NUMBER")?.toInt() ?: 1
  val appId = project.properties["APP_ID"] as? String ?: "shiroikuma.jiyudoga"

  val baseCode = (major * 10000 + minor * 100 + patch) * 10 + respin
  val versionCode = baseCode * 1000 + buildNumber
  val versionName = "$forkVersion+%03d".format(buildNumber)

  return VersionInfo(appId, versionName, versionCode)
}

val versionInfo = getVersionInfo(project)

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// Release signing: gitignored keystore.properties at the repo root points at
// ~/.android-keystores/shiroikuma-jiyudoga.jks (alias jiyudoga).
val keystoreProperties = Properties().apply {
  val f = rootProject.file("../keystore.properties")
  if (f.exists()) {
    f.inputStream().use { load(it) }
  }
}

android {
    signingConfigs {
      getByName("debug") {
        // inject signing config
      };
      create("release") {
        if (keystoreProperties.containsKey("storeFile")) {
          storeFile = file(keystoreProperties["storeFile"] as String)
          storePassword = keystoreProperties["storePassword"] as String
          keyAlias = keystoreProperties["keyAlias"] as String
          keyPassword = keystoreProperties["keyPassword"] as String
        }
      }
    }
    namespace = "io.freetubeapp.freetube"
    compileSdk = 34
    dataBinding {
        enable = true
    }
    defaultConfig {
        applicationId = versionInfo.appId
        minSdk = 29
        targetSdk = 34
        versionCode = versionInfo.versionCode
        versionName = versionInfo.version

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"

        ndk {
            abiFilters += "arm64-v8a"
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
            signingConfig = if (keystoreProperties.containsKey("storeFile")) {
              signingConfigs.getByName("release")
            } else {
              signingConfigs.getByName("debug")
            }
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_1_8
        targetCompatibility = JavaVersion.VERSION_1_8
    }
    kotlinOptions {
        jvmTarget = "1.8"
    }
    buildFeatures {
        viewBinding = true
    }
}

dependencies {

    implementation("com.google.android.material:material:1.11.0")
    implementation("androidx.media3:media3-ui:1.2.1")

}
