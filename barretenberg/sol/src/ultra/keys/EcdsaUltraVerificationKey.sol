// Verification Key Hash: 47c4d766a5ca40358461d3f1848edc7cac6b144856961ad4b72be7dae0c22c21
// SPDX-License-Identifier: Apache-2.0
// Copyright 2022 Aztec
pragma solidity >=0.8.4;

library EcdsaUltraVerificationKey {
    function verificationKeyHash() internal pure returns (bytes32) {
        return 0x47c4d766a5ca40358461d3f1848edc7cac6b144856961ad4b72be7dae0c22c21;
    }

    function loadVerificationKey(uint256 _vk, uint256 _omegaInverseLoc) internal pure {
        assembly {
            mstore(add(_vk, 0x00), 0x0000000000000000000000000000000000000000000000000000000000010000) // vk.circuit_size
            mstore(add(_vk, 0x20), 0x0000000000000000000000000000000000000000000000000000000000000006) // vk.num_inputs
            mstore(add(_vk, 0x40), 0x00eeb2cb5981ed45649abebde081dcff16c8601de4347e7dd1628ba2daac43b7) // vk.work_root
            mstore(add(_vk, 0x60), 0x30641e0e92bebef818268d663bcad6dbcfd6c0149170f6d7d350b1b1fa6c1001) // vk.domain_inverse
            mstore(add(_vk, 0x80), 0x0d03a55e1c08f638bec6b3b6726ec4e8b4a2445fb898001c5cc59d90747265e1) // vk.Q1.x
            mstore(add(_vk, 0xa0), 0x28f5aaa22aae66726d58d5e1dd57733badd7577f842cafbef590b563688d3057) // vk.Q1.y
            mstore(add(_vk, 0xc0), 0x01ad27a5f461c70403ce6f694c448da777487d43b58a0e4e6cd1cad813ad90f4) // vk.Q2.x
            mstore(add(_vk, 0xe0), 0x0e02f03282ea9e987e16152483daba0d48545880bd3f0d171264f16c3de01de1) // vk.Q2.y
            mstore(add(_vk, 0x100), 0x2331cfe626ebde7cd5c53d392b3cefe49b0763d3ad40e4c83a028a78ae2bfdf3) // vk.Q3.x
            mstore(add(_vk, 0x120), 0x1f9bc26b884c0d494656412ea9c95a4d32955f3cb19e47db0c2143b231e97860) // vk.Q3.y
            mstore(add(_vk, 0x140), 0x2839198a3ce970ca0a0fafe33d2ca8ffe50d70be7e613eb710c08ca95115998e) // vk.Q4.x
            mstore(add(_vk, 0x160), 0x0da0e1c3eb107528a589868e34ae65114de290ddd45ff23fc5f637c0da23c1a2) // vk.Q4.y
            mstore(add(_vk, 0x180), 0x29e22617fc67ce5065539da1ba4e8a733e8e42738f2b579b07fcdacbc4ea541c) // vk.Q_M.x
            mstore(add(_vk, 0x1a0), 0x280fb591b4cc7695bf75168a0327aa70aa82fdadc1b00ebc0ed8ca1deb45e093) // vk.Q_M.y
            mstore(add(_vk, 0x1c0), 0x2ae855c250cd7b84e59b16bd038785b3c0a474ce4e80cbc59b33846c2f7445d9) // vk.Q_C.x
            mstore(add(_vk, 0x1e0), 0x013ec37a92162385e03976dfbf07bd494be99740f6e598d79cd771e821a8fd60) // vk.Q_C.y
            mstore(add(_vk, 0x200), 0x13db96945a09894dddfa79d2b9f9e9e1eb6204065f662a17d7dbf6d257590d33) // vk.Q_ARITHMETIC.x
            mstore(add(_vk, 0x220), 0x00d9af8f917935b1836f17dcdf1d44a1fa4e3655777f8ddca39905b38b80ab48) // vk.Q_ARITHMETIC.y
            mstore(add(_vk, 0x240), 0x1a66842ed11152b8ccd1ffe548414be7dadbb956ae828c47cb32c449fb9a2a21) // vk.QSORT.x
            mstore(add(_vk, 0x260), 0x0b4304dfa9379f11f9387befd9522dde481e04d359a511e543b9c9fcfd4c8e70) // vk.QSORT.y
            mstore(add(_vk, 0x280), 0x2f213c7a4c064a63d6a07366df0ea85aef9ad2125a188c3e656f95471e416a0a) // vk.Q_ELLIPTIC.x
            mstore(add(_vk, 0x2a0), 0x067a270bed55e72ffb3cfa39af3e5b8bcb4961d72bb301978af13c4ddc73e5df) // vk.Q_ELLIPTIC.y
            mstore(add(_vk, 0x2c0), 0x27b10524a99f00d9c59cc15ff3b7dfc34975b6f18e06b9c6c3a6136bf3b56f32) // vk.Q_AUX.x
            mstore(add(_vk, 0x2e0), 0x071a9bf80d112c32482178ff02f855436cf6fb4b4376ef7e2f03381c2e6da379) // vk.Q_AUX.y
            mstore(add(_vk, 0x300), 0x23904a6dcee70f3275bc323178df29575a8042333388123d808922a4ac14d66c) // vk.SIGMA1.x
            mstore(add(_vk, 0x320), 0x18b9c021b795ee06660c1a4fee630dc0e6aa605408c2662e0f5d54648f7ebb3c) // vk.SIGMA1.y
            mstore(add(_vk, 0x340), 0x2b222d8ae83eaec10db010cfec35d326df64053dcb4a1ecde1fbdeb2b312912d) // vk.SIGMA2.x
            mstore(add(_vk, 0x360), 0x2e1e70c7600abea70257dbd6f05838bcb881646e06f3df5acb105b7a1a509c26) // vk.SIGMA2.y
            mstore(add(_vk, 0x380), 0x1b324b63bf3864aab4d796e5095563f7e4ef6af0e8499cb91f1da90be847a7d7) // vk.SIGMA3.x
            mstore(add(_vk, 0x3a0), 0x16e5682a54699b4a3ee4255aa372cc3b5262300b3684dba139cb98bb01ac9faa) // vk.SIGMA3.y
            mstore(add(_vk, 0x3c0), 0x1e6167376510d37e4d267058578f15e79141c4ee5aa38f479ab58f469e82a608) // vk.SIGMA4.x
            mstore(add(_vk, 0x3e0), 0x16e147005ca23abea5055000d5505f4813e28c303e3656b66cf7a4cd647c98fd) // vk.SIGMA4.y
            mstore(add(_vk, 0x400), 0x18f7cf965339d9c9d190296fa92f915767b0a8da455975f3e03fa98439fd7110) // vk.TABLE1.x
            mstore(add(_vk, 0x420), 0x0eecc02f9d44125407adbf00d56b086afd1adc5de536450afe05de382761b32f) // vk.TABLE1.y
            mstore(add(_vk, 0x440), 0x0bdfe662ea9f40f125ca5f7e99a8c6ba09b87ba8313864316745df862946c5c4) // vk.TABLE2.x
            mstore(add(_vk, 0x460), 0x0c5313c5b17634332920f54081fd46464a5ce9399e507c8fece9df28bff19033) // vk.TABLE2.y
            mstore(add(_vk, 0x480), 0x232ab86409f60c50fd5f04e879fbcbe60e358eb0337c5d0db1934277e1d8b1f2) // vk.TABLE3.x
            mstore(add(_vk, 0x4a0), 0x1fda66dfb58273345f2471dff55c51b6856241460272e64b4cc67cde65231e89) // vk.TABLE3.y
            mstore(add(_vk, 0x4c0), 0x024ccc0fcff3b515cdc97dde2fae5c516bf3c97207891801707142af02538a83) // vk.TABLE4.x
            mstore(add(_vk, 0x4e0), 0x27827250d02b7b67d084bfc52b26c722f33f75ae5098c109573bfe92b782e559) // vk.TABLE4.y
            mstore(add(_vk, 0x500), 0x15985385d1aa90674122e82725090452dfa93457b5dde13c8b33efef98fff114) // vk.TABLE_TYPE.x
            mstore(add(_vk, 0x520), 0x2c2899d602af17f7248199a7654118b9d17f7927ea4b3ba57bdb9ac4fb2c160f) // vk.TABLE_TYPE.y
            mstore(add(_vk, 0x540), 0x21efa829ce91cdd4263a3ff0853f05818eab4ad41c9b0e997003fe894f449e32) // vk.ID1.x
            mstore(add(_vk, 0x560), 0x0c047b4340c66fc18ecaebb454059bb5fffbac7c9f1fe1e5335bd17b6de47bd6) // vk.ID1.y
            mstore(add(_vk, 0x580), 0x08bed3e3394706c35d7a63be542bba01b2b7887dd862206b354141e882981745) // vk.ID2.x
            mstore(add(_vk, 0x5a0), 0x1b74c9bd464f4540853ca869206f47d44aa2ba3bd68dafcc82765c0bd0933420) // vk.ID2.y
            mstore(add(_vk, 0x5c0), 0x22ef220782674f44cdb2604dd3eaecfd36c729c463a4c92204a620d07e1416b9) // vk.ID3.x
            mstore(add(_vk, 0x5e0), 0x087e275bd5d63aba524e0e8b43915a91d2496df9b1bf961d4dde6ae7d4e222d2) // vk.ID3.y
            mstore(add(_vk, 0x600), 0x27a4c598d505372d7c03681cf5720438e17e6ffab22d0a85f480f5ceb7e50926) // vk.ID4.x
            mstore(add(_vk, 0x620), 0x2cc881edb02565957ea2797c16ae8e2a77eaef5e9d9a98e55a12e9349d158f2c) // vk.ID4.y
            mstore(add(_vk, 0x640), 0x00) // vk.contains_pairing_point_accumulator
            mstore(add(_vk, 0x660), 0) // vk.pairing_point_accumulator_public_input_indices
            mstore(add(_vk, 0x680), 0x260e01b251f6f1c7e7ff4e580791dee8ea51d87a358e038b4efe30fac09383c1) // vk.g2_x.X.c1
            mstore(add(_vk, 0x6a0), 0x0118c4d5b837bcc2bc89b5b398b5974e9f5944073b32078b7e231fec938883b0) // vk.g2_x.X.c0
            mstore(add(_vk, 0x6c0), 0x04fc6369f7110fe3d25156c1bb9a72859cf2a04641f99ba4ee413c80da6a5fe4) // vk.g2_x.Y.c1
            mstore(add(_vk, 0x6e0), 0x22febda3c0c0632a56475b4214e5615e11e6dd3f96e6cea2854a87d4dacc5e55) // vk.g2_x.Y.c0
            mstore(_omegaInverseLoc, 0x0b5d56b77fe704e8e92338c0082f37e091126414c830e4c6922d5ac802d842d4) // vk.work_root_inverse
        }
    }
}
