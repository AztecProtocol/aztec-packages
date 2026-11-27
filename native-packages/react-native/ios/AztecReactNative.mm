// Registers the C++ TurboModule (NativeAztecReactNative) with React Native on iOS, and gives it the app's
// data directory.

#import <Foundation/Foundation.h>
#import <React/RCTBridgeModule.h>
#import <ReactCommon/RCTTurboModule.h>

#include "NativeAztecReactNative.h"

@interface AztecReactNative : NSObject <RCTBridgeModule, RCTTurboModule>
@end

@implementation AztecReactNative

RCT_EXPORT_MODULE(AztecReactNative)

+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params
{
  return std::make_shared<facebook::react::NativeAztecReactNative>(params.jsInvoker);
}

@end

namespace aztec::react_native {

std::string default_data_directory()
{
  NSArray<NSString *> *dirs =
      NSSearchPathForDirectoriesInDomains(NSApplicationSupportDirectory, NSUserDomainMask, YES);
  return std::string([[dirs.firstObject stringByAppendingPathComponent:@"aztec"] UTF8String]);
}

} // namespace aztec::react_native
