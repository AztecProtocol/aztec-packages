#include "bb_mobile.h"

#include <jni.h>

extern "C" JNIEXPORT jstring JNICALL
Java_com_aztec_barretenberg_mobilebench_MainActivity_nativeStatus(JNIEnv* env, jclass)
{
    return env->NewStringUTF(bb_mobile_status());
}

extern "C" JNIEXPORT jint JNICALL
Java_com_aztec_barretenberg_mobilebench_MainActivity_nativeAbiVersion(JNIEnv*, jclass)
{
    return bb_mobile_abi_version();
}
