#include "barretenberg/vm2/common/aztec_types.hpp"

#include <gmock/gmock.h>
#include <gtest/gtest.h>

namespace bb::avm2 {
namespace {

using ::testing::ElementsAre;
using ::testing::Eq;

TEST(PublicLogsTest, DefaultConstructor)
{
    PublicLogs public_logs;
    EXPECT_EQ(public_logs.length, 0);
    EXPECT_EQ(public_logs.payload.size(), FLAT_PUBLIC_LOGS_PAYLOAD_LENGTH);
    // All payload elements should be zero-initialized
    for (size_t i = 0; i < FLAT_PUBLIC_LOGS_PAYLOAD_LENGTH; ++i) {
        EXPECT_EQ(public_logs.payload[i], FF(0));
    }
}

TEST(PublicLogsTest, ConstructorWithLengthAndPayload)
{
    std::array<FF, FLAT_PUBLIC_LOGS_PAYLOAD_LENGTH> payload{};
    payload[0] = FF(3);      // log length
    payload[1] = FF(0x1234); // contract address
    payload[2] = FF(100);
    payload[3] = FF(200);
    payload[4] = FF(300);

    uint32_t length = 5; // 2 (header) + 3 (fields)
    PublicLogs public_logs(length, payload);

    EXPECT_EQ(public_logs.length, length);
    EXPECT_EQ(public_logs.payload[0], FF(3));
    EXPECT_EQ(public_logs.payload[1], FF(0x1234));
    EXPECT_EQ(public_logs.payload[2], FF(100));
    EXPECT_EQ(public_logs.payload[3], FF(200));
    EXPECT_EQ(public_logs.payload[4], FF(300));
}

TEST(PublicLogsTest, ConstructorFromEmptyVector)
{
    std::vector<PublicLog> logs;
    PublicLogs public_logs(logs);

    EXPECT_EQ(public_logs.length, 0);
    std::vector<PublicLog> recovered_logs = public_logs.to_logs();
    EXPECT_TRUE(recovered_logs.empty());
}

TEST(PublicLogsTest, ConstructorFromSingleLog)
{
    AztecAddress contract_address = FF(0xdeadbeef);
    std::vector<FF> fields = { FF(1), FF(2), FF(3) };
    PublicLog log{ fields, contract_address };

    std::vector<PublicLog> logs = { log };
    PublicLogs public_logs(logs);

    EXPECT_EQ(public_logs.length, fields.size() + PUBLIC_LOG_HEADER_LENGTH);
    EXPECT_EQ(public_logs.payload[0], FF(fields.size()));
    EXPECT_EQ(public_logs.payload[1], contract_address);
    EXPECT_EQ(public_logs.payload[2], FF(1));
    EXPECT_EQ(public_logs.payload[3], FF(2));
    EXPECT_EQ(public_logs.payload[4], FF(3));
}

TEST(PublicLogsTest, ConstructorFromMultipleLogs)
{
    AztecAddress addr1 = FF(0x1111);
    AztecAddress addr2 = FF(0x2222);
    AztecAddress addr3 = FF(0x3333);

    std::vector<PublicLog> logs = {
        PublicLog{ { FF(1), FF(2), FF(3) }, addr1 },
        PublicLog{ { FF(4), FF(5) }, addr2 },
        PublicLog{ { FF(6) }, addr3 },
    };

    PublicLogs public_logs(logs);

    // First log: length=3, addr=0x1111, fields=[1,2,3] -> total 5
    // Second log: length=2, addr=0x2222, fields=[4,5] -> total 4
    // Third log: length=1, addr=0x3333, fields=[6] -> total 3
    // Total: 5 + 4 + 3 = 12
    EXPECT_EQ(public_logs.length, 12);

    // Verify first log
    EXPECT_EQ(public_logs.payload[0], FF(3));
    EXPECT_EQ(public_logs.payload[1], addr1);
    EXPECT_EQ(public_logs.payload[2], FF(1));
    EXPECT_EQ(public_logs.payload[3], FF(2));
    EXPECT_EQ(public_logs.payload[4], FF(3));

    // Verify second log
    EXPECT_EQ(public_logs.payload[5], FF(2));
    EXPECT_EQ(public_logs.payload[6], addr2);
    EXPECT_EQ(public_logs.payload[7], FF(4));
    EXPECT_EQ(public_logs.payload[8], FF(5));

    // Verify third log
    EXPECT_EQ(public_logs.payload[9], FF(1));
    EXPECT_EQ(public_logs.payload[10], addr3);
    EXPECT_EQ(public_logs.payload[11], FF(6));
}

TEST(PublicLogsTest, AddLogToEmpty)
{
    PublicLogs public_logs;
    AztecAddress contract_address = FF(0xabcd);
    std::vector<FF> fields = { FF(10), FF(20) };
    PublicLog log{ fields, contract_address };

    public_logs.add_log(log);

    EXPECT_EQ(public_logs.length, fields.size() + PUBLIC_LOG_HEADER_LENGTH);
    EXPECT_EQ(public_logs.payload[0], FF(fields.size()));
    EXPECT_EQ(public_logs.payload[1], contract_address);
    EXPECT_EQ(public_logs.payload[2], FF(10));
    EXPECT_EQ(public_logs.payload[3], FF(20));
}

TEST(PublicLogsTest, AddMultipleLogs)
{
    PublicLogs public_logs;

    AztecAddress addr1 = FF(0xaaaa);
    PublicLog log1{ { FF(1), FF(2) }, addr1 };
    public_logs.add_log(log1);

    AztecAddress addr2 = FF(0xbbbb);
    PublicLog log2{ { FF(3), FF(4), FF(5) }, addr2 };
    public_logs.add_log(log2);

    EXPECT_EQ(public_logs.length, 2 + 2 + 2 + 3); // 2 logs with headers: (2+2) + (2+3) = 9

    // Verify first log
    EXPECT_EQ(public_logs.payload[0], FF(2));
    EXPECT_EQ(public_logs.payload[1], addr1);
    EXPECT_EQ(public_logs.payload[2], FF(1));
    EXPECT_EQ(public_logs.payload[3], FF(2));

    // Verify second log
    EXPECT_EQ(public_logs.payload[4], FF(3));
    EXPECT_EQ(public_logs.payload[5], addr2);
    EXPECT_EQ(public_logs.payload[6], FF(3));
    EXPECT_EQ(public_logs.payload[7], FF(4));
    EXPECT_EQ(public_logs.payload[8], FF(5));
}

TEST(PublicLogsTest, AddLogWithEmptyFields)
{
    PublicLogs public_logs;
    AztecAddress contract_address = FF(0x1234);
    PublicLog log{ {}, contract_address };

    public_logs.add_log(log);

    EXPECT_EQ(public_logs.length, PUBLIC_LOG_HEADER_LENGTH);
    EXPECT_EQ(public_logs.payload[0], FF(0));
    EXPECT_EQ(public_logs.payload[1], contract_address);
}

TEST(PublicLogsTest, FromLogsStaticMethod)
{
    std::vector<PublicLog> logs = {
        PublicLog{ { FF(1) }, FF(0x1111) },
        PublicLog{ { FF(2), FF(3) }, FF(0x2222) },
    };

    PublicLogs public_logs = PublicLogs::from_logs(logs);

    EXPECT_EQ(public_logs.length, 1 + 2 + 2 + 2); // (1+2) + (2+2) = 7
    EXPECT_EQ(public_logs.payload[0], FF(1));
    EXPECT_EQ(public_logs.payload[1], FF(0x1111));
    EXPECT_EQ(public_logs.payload[2], FF(1));
    EXPECT_EQ(public_logs.payload[3], FF(2));
    EXPECT_EQ(public_logs.payload[4], FF(0x2222));
    EXPECT_EQ(public_logs.payload[5], FF(2));
    EXPECT_EQ(public_logs.payload[6], FF(3));
}

TEST(PublicLogsTest, ToLogsEmpty)
{
    PublicLogs public_logs;
    std::vector<PublicLog> logs = public_logs.to_logs();
    EXPECT_TRUE(logs.empty());
}

TEST(PublicLogsTest, ToLogsSingle)
{
    PublicLogs public_logs;
    AztecAddress contract_address = FF(0xbeef);
    std::vector<FF> fields = { FF(42), FF(43) };
    PublicLog original_log{ fields, contract_address };
    public_logs.add_log(original_log);

    std::vector<PublicLog> recovered_logs = public_logs.to_logs();

    ASSERT_EQ(recovered_logs.size(), 1);
    EXPECT_EQ(recovered_logs[0].contract_address, contract_address);
    EXPECT_THAT(recovered_logs[0].fields, ElementsAre(FF(42), FF(43)));
}

TEST(PublicLogsTest, ToLogsMultiple)
{
    std::vector<PublicLog> original_logs = {
        PublicLog{ { FF(1), FF(2), FF(3) }, FF(0x1111) },
        PublicLog{ { FF(4), FF(5) }, FF(0x2222) },
        PublicLog{ { FF(6) }, FF(0x3333) },
    };

    PublicLogs public_logs(original_logs);
    std::vector<PublicLog> recovered_logs = public_logs.to_logs();

    ASSERT_EQ(recovered_logs.size(), 3);

    EXPECT_EQ(recovered_logs[0].contract_address, FF(0x1111));
    EXPECT_THAT(recovered_logs[0].fields, ElementsAre(FF(1), FF(2), FF(3)));

    EXPECT_EQ(recovered_logs[1].contract_address, FF(0x2222));
    EXPECT_THAT(recovered_logs[1].fields, ElementsAre(FF(4), FF(5)));

    EXPECT_EQ(recovered_logs[2].contract_address, FF(0x3333));
    EXPECT_THAT(recovered_logs[2].fields, ElementsAre(FF(6)));
}

TEST(PublicLogsTest, RoundTripConversion)
{
    std::vector<PublicLog> original_logs = {
        PublicLog{ { FF(10), FF(20), FF(30) }, FF(0xaaaa) },
        PublicLog{ { FF(40), FF(50) }, FF(0xbbbb) },
        PublicLog{ { FF(60) }, FF(0xcccc) },
        PublicLog{ {}, FF(0xdddd) }, // Empty fields
    };

    PublicLogs public_logs(original_logs);
    std::vector<PublicLog> recovered_logs = public_logs.to_logs();

    ASSERT_EQ(recovered_logs.size(), original_logs.size());

    for (size_t i = 0; i < original_logs.size(); ++i) {
        EXPECT_EQ(recovered_logs[i].contract_address, original_logs[i].contract_address);
        EXPECT_EQ(recovered_logs[i].fields.size(), original_logs[i].fields.size());
        for (size_t j = 0; j < original_logs[i].fields.size(); ++j) {
            EXPECT_EQ(recovered_logs[i].fields[j], original_logs[i].fields[j]);
        }
    }
}

TEST(PublicLogsTest, EqualityOperator)
{
    std::vector<PublicLog> logs = {
        PublicLog{ { FF(1), FF(2) }, FF(0x1111) },
        PublicLog{ { FF(3) }, FF(0x2222) },
    };

    PublicLogs public_logs1(logs);
    PublicLogs public_logs2(logs);

    EXPECT_EQ(public_logs1, public_logs2);
}

TEST(PublicLogsTest, EqualityOperatorDifferentLength)
{
    PublicLogs public_logs1;
    public_logs1.add_log(PublicLog{ { FF(1) }, FF(0x1111) });

    PublicLogs public_logs2;
    public_logs2.add_log(PublicLog{ { FF(1) }, FF(0x1111) });
    public_logs2.add_log(PublicLog{ { FF(2) }, FF(0x2222) });

    EXPECT_NE(public_logs1, public_logs2);
}

TEST(PublicLogsTest, EqualityOperatorDifferentPayload)
{
    PublicLogs public_logs1;
    public_logs1.add_log(PublicLog{ { FF(1) }, FF(0x1111) });

    PublicLogs public_logs2;
    public_logs2.add_log(PublicLog{ { FF(2) }, FF(0x1111) });

    EXPECT_NE(public_logs1, public_logs2);
}

TEST(PublicLogsTest, EqualityOperatorDifferentContractAddress)
{
    PublicLogs public_logs1;
    public_logs1.add_log(PublicLog{ { FF(1) }, FF(0x1111) });

    PublicLogs public_logs2;
    public_logs2.add_log(PublicLog{ { FF(1) }, FF(0x2222) });

    EXPECT_NE(public_logs1, public_logs2);
}

TEST(PublicLogsTest, LargeLog)
{
    std::vector<FF> large_fields;
    for (uint32_t i = 0; i < 100; ++i) {
        large_fields.push_back(FF(i));
    }

    AztecAddress contract_address = FF(0xffff);
    PublicLog large_log{ large_fields, contract_address };

    PublicLogs public_logs;
    public_logs.add_log(large_log);

    EXPECT_EQ(public_logs.length, large_fields.size() + PUBLIC_LOG_HEADER_LENGTH);
    EXPECT_EQ(public_logs.payload[0], FF(large_fields.size()));
    EXPECT_EQ(public_logs.payload[1], contract_address);

    for (size_t i = 0; i < large_fields.size(); ++i) {
        EXPECT_EQ(public_logs.payload[PUBLIC_LOG_HEADER_LENGTH + i], FF(i));
    }

    std::vector<PublicLog> recovered_logs = public_logs.to_logs();
    ASSERT_EQ(recovered_logs.size(), 1);
    EXPECT_EQ(recovered_logs[0].fields.size(), large_fields.size());
    for (size_t i = 0; i < large_fields.size(); ++i) {
        EXPECT_EQ(recovered_logs[0].fields[i], FF(i));
    }
}

TEST(PublicLogsTest, ManySmallLogs)
{
    PublicLogs public_logs;
    const uint32_t num_logs = 50;

    for (uint32_t i = 0; i < num_logs; ++i) {
        AztecAddress contract_address = FF(i);
        PublicLog log{ { FF(i * 10), FF(i * 10 + 1) }, contract_address };
        public_logs.add_log(log);
    }

    std::vector<PublicLog> recovered_logs = public_logs.to_logs();
    ASSERT_EQ(recovered_logs.size(), num_logs);

    for (uint32_t i = 0; i < num_logs; ++i) {
        EXPECT_EQ(recovered_logs[i].contract_address, FF(i));
        EXPECT_THAT(recovered_logs[i].fields, ElementsAre(FF(i * 10), FF(i * 10 + 1)));
    }
}

} // namespace
} // namespace bb::avm2
