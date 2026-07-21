import groovy.json.JsonSlurper
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
//   upstream package.json version <maj>.<min>.<patch>  ->  baseCode = maj*10000 + min*100 + patch
//   versionName = "<upstream>+<BUILD_NUMBER>"
//   versionCode = baseCode * 10000 + BUILD_NUMBER   (0.25.1+1 -> 25010001)
// BUILD_NUMBER lives in android/gradle.properties and is bumped by the fork build script.
fun getVersionInfo(project: Project): VersionInfo {
  val json = JsonSlurper()
  val packageJsonPath = project.file("../../package.json")

  val packageJson = json.parse(packageJsonPath) as Map<String, Any>
  val upstreamVersion = (packageJson["version"] as String).split("-")[0]
  val numbers = upstreamVersion.split(".")
  val major = numbers[0].toInt()
  val minor = numbers[1].toInt()
  val patch = numbers[2].toInt()

  val buildNumber = (project.properties["BUILD_NUMBER"] as? String)?.toInt() ?: 1
  val appId = project.properties["APP_ID"] as? String ?: "shiroikuma.jiyudoga"

  val baseCode = major * 10000 + minor * 100 + patch
  val versionCode = baseCode * 10000 + buildNumber
  val versionName = "$upstreamVersion+$buildNumber"

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
