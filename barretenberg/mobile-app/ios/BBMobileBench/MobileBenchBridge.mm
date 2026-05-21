#import "MobileBenchBridge.h"

#include "bb_mobile.h"

@implementation MobileBenchBridge

+ (NSString*)status
{
    return [NSString stringWithUTF8String:bb_mobile_status()];
}

+ (NSInteger)abiVersion
{
    return bb_mobile_abi_version();
}

@end
