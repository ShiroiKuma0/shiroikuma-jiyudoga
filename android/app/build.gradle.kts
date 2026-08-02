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
//   versionName = "<FORK_VERSION><FreeTube pin><FreeTubeAndroid pin>+<BUILD_NUMBER>", each pin
//                 being ".<base commit date>.g<8-char base sha>" and the counter zero-padded to
//                 three digits (global rule: artifact lists sort in build order)
//   Both upstreams are git-tracking, so both are pinned (global git-versioning rule): master
//   mirrors FreeTube's *development tip* and we merge FreeTubeAndroid's `release` branch, so
//   FORK_VERSION alone never says how current either side is. Pins never touch versionCode,
//   which carries the ordering on Android.
//   baseCode    = (maj*10000 + min*100 + patch) * 10 + respin
//   versionCode = baseCode * 1000 + BUILD_NUMBER
//                 (0.25.1+039 -> 25010039, 0.25.1.1+001 -> 25011001)
//   The respin gets its own digit so versionCode still RISES across a respin bump even
//   though BUILD_NUMBER resets to 1 on every FORK_VERSION change; the counter's slot is
//   three digits, which it already was in every name. Codes shipped under the previous
//   formula reproduce unchanged (respin 0, counter <= 999).
// FORK_VERSION and BUILD_NUMBER live in the repo-root fork.properties (shared with the deb
// build); BUILD_NUMBER is bumped by _scripts/build-fork.sh.
fun gitOutput(project: Project, vararg command: String): String = try {
  ProcessBuilder()
    .command(*command)
    .directory(project.file("../.."))
    .start()
    .inputStream.bufferedReader().use { it.readText() }
    .trim()
} catch (e: Exception) {
  println("Git command [${command.joinToString(" ")}] failed [$e]")
  ""
}

// One upstream-base pin: ".<base commit date>.g<8-char base sha>", degrading to ".g<sha>" when the
// date lookup fails and to "" when git or the ref is absent — a build must never fail over a
// missing sha. The date is that commit's own committer date, never build time: every build on one
// base must share a pin, and the date is what makes the names sort chronologically (a bare sha
// orders them at random).
fun forkPin(project: Project, ref: String): String {
  val sha = gitOutput(project, "git", "merge-base", "HEAD", ref).take(8)
  if (sha.length != 8) return ""
  val date = gitOutput(project, "git", "show", "-s", "--format=%cd", "--date=format:%Y-%m-%d", sha)
  return if (date.length == 10) ".$date.g$sha" else ".g$sha"
}

// Exit status of a git command, for the checks that answer yes/no rather than printing.
fun gitSucceeds(project: Project, vararg command: String): Boolean = try {
  ProcessBuilder()
    .command(*command)
    .directory(project.file("../.."))
    .redirectOutput(ProcessBuilder.Redirect.DISCARD)
    .redirectError(ProcessBuilder.Redirect.DISCARD)
    .start()
    .waitFor() == 0
} catch (e: Exception) {
  println("Git command [${command.joinToString(" ")}] failed [$e]")
  false
}

// The FreeTubeAndroid pin must name FreeTubeAndroid work, not history the two upstreams SHARE.
// Their `development` regularly merges FreeTube's own development into itself, so until we have
// merged their branch the newest commit we have in common with it is a FREETUBE commit. Pinning
// that would name the wrong upstream and would drift on every FreeTube sync, so drop the pin
// instead — no pin is honest, a wrong one is not.
fun forkPinAndroid(project: Project, ref: String): String {
  val mergeBase = gitOutput(project, "git", "merge-base", "HEAD", ref)
  if (mergeBase.isEmpty()) return ""
  if (gitSucceeds(project, "git", "rev-parse", "--verify", "-q", "master") &&
    gitSucceeds(project, "git", "merge-base", "--is-ancestor", mergeBase, "master")
  ) {
    return ""
  }
  return forkPin(project, ref)
}

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

  // BOTH upstreams are git-tracking, so both are pinned: neither version literal identifies the
  // commit we actually contain (master mirrors FreeTube's *development tip*, and we merge
  // FreeTubeAndroid's `release` branch rather than its tags). Each pin is the merge-base of HEAD
  // and that ref — the upstream commit our layer sits on — NOT our own HEAD (already covered by
  // +N) and NOT the ref's tip (which overstates it when custom has not merged the new tip yet).
  // Order is fixed: FreeTube first, FreeTubeAndroid second. Each pin moves only when that upstream
  // is synced, which is exactly the "this upstream has not moved" signal.
  val upstreamPin = forkPin(project, "master") + forkPinAndroid(project, "android/development")

  val baseCode = (major * 10000 + minor * 100 + patch) * 10 + respin
  val versionCode = baseCode * 1000 + buildNumber
  val versionName = "$forkVersion$upstreamPin+%03d".format(buildNumber)

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
