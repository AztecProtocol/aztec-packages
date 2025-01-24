window.BENCHMARK_DATA = {
  "lastUpdate": 1737752521873,
  "repoUrl": "https://github.com/AztecProtocol/aztec-packages",
  "entries": {
    "C++ Benchmark": [
      {
        "commit": {
          "author": {
            "email": "84741533+jewelofchaos9@users.noreply.github.com",
            "name": "defkit",
            "username": "jewelofchaos9"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "1cb7cd78d089fd1e2706d9d5993b6115bcdd6a84",
          "message": "feat: Acir formal proofs (#10973)\n\nThe ACIR formal verification. Combines a test generator in the Noir\r\nrepository with a formal verifier in Barretenberg to mathematically\r\nprove the correctness of ACIR instructions using SMT solving. Verifies\r\nrange of operations including 127-bit arithmetic (addition, subtraction,\r\nmultiplication), 126-bit division, bitwise operations (though currently\r\nlimited to 32-bit for AND/OR/XOR), shift operations, field operations\r\n(ADD, MUL, DIV), and comparison operations",
          "timestamp": "2025-01-07T13:02:00Z",
          "tree_id": "69853ce22187e324099c50b06b7998655253f14e",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/1cb7cd78d089fd1e2706d9d5993b6115bcdd6a84"
        },
        "date": 1736256421112,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 19654.74621499999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 17119.365716 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21345.15435100002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 18545.349747 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4621.581203999966,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4209.548783000001 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 71484.080483,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 71484081000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 13909.907984000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 13909908000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2907780000,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2907780000 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 144538888,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 144538888 ns\nthreads: 1"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "mara@aztecprotocol.com",
            "name": "maramihali",
            "username": "maramihali"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "48286c671a61dbe18e5f8e0c44e71ab6c3fd109a",
          "message": "feat: derive transcript structure between non-zk and zk flavors and between Ultra and UltraKeccak (#11086)\n\nThe Transcript Classes were duplicated between base and derived flavors\r\nwhich resulted at times in inconsistencies. This PR addresses the issue:\r\n* ZK flavors' Transcript is now a derived class of the corresponding\r\nnon-ZK Transcript class\r\n* `UltraFlavor` Transcript is now templated so in UltraKeccak we can\r\njust instantiate it with different parameters corresponding to Keccak\r\nrather than duplicate it.\r\n * the transcript tests are run for all flavor variations.",
          "timestamp": "2025-01-07T15:34:25Z",
          "tree_id": "d391f1021ecc959fd74dc082e8b5ecf214b80f5a",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/48286c671a61dbe18e5f8e0c44e71ab6c3fd109a"
        },
        "date": 1736265565440,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 19626.07817200001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 17136.909223 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21383.976447999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 18807.720404 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4604.717794999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4331.753499 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 72311.288592,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 72311289000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14029.206929,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14029207000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2845686908,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2845686908 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 141417451,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 141417451 ns\nthreads: 1"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "name": "AztecProtocol",
            "username": "AztecProtocol"
          },
          "committer": {
            "name": "AztecProtocol",
            "username": "AztecProtocol"
          },
          "id": "c1f244c07c642a7cca81a97e4bf7b6e81fbdd346",
          "message": "chore(master): Release 0.69.1",
          "timestamp": "2025-01-08T14:05:53Z",
          "url": "https://github.com/AztecProtocol/aztec-packages/pull/11028/commits/c1f244c07c642a7cca81a97e4bf7b6e81fbdd346"
        },
        "date": 1736345724350,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18830.88268400002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16404.830672 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21144.691059999957,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 18560.566394999998 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4145.21271000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3865.9703339999996 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 74067.02149200001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 74067022000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15195.970955999997,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15195970000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2798613413,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2798613413 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 133968091,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 133968091 ns\nthreads: 1"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "49558828+AztecBot@users.noreply.github.com",
            "name": "Aztec Bot",
            "username": "AztecBot"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "b8ef30e2a147b5318b70ff2146186dfbae70af42",
          "message": "chore: redo typo PR by longxiangqiao (#11109)\n\nThanks longxiangqiao for\nhttps://github.com/AztecProtocol/aztec-packages/pull/11108. Our policy\nis to redo typo changes to dissuade metric farming. This is an automated\nscript.",
          "timestamp": "2025-01-08T18:26:47Z",
          "tree_id": "b4bd16010c74eafcb1f37a95d23ffa33ff5496bc",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/b8ef30e2a147b5318b70ff2146186dfbae70af42"
        },
        "date": 1736361781827,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 19526.87434699999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 17100.775563000003 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21344.412034999947,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 18796.992326000003 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4631.039611000006,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4267.490723 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 71776.31402,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 71776314000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 13913.263356,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 13913264000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2860133484,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2860133484 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 142133784,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 142133784 ns\nthreads: 1"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "karl.lye@gmail.com",
            "name": "Charlie Lye",
            "username": "charlielye"
          },
          "committer": {
            "email": "karl.lye@gmail.com",
            "name": "Charlie Lye",
            "username": "charlielye"
          },
          "distinct": true,
          "id": "137ade8a50686d8dd14717895f9a1aa72a073e52",
          "message": "memsuspend on acir_tests. don't overwrite noir-repo stuff.",
          "timestamp": "2025-01-08T21:15:44Z",
          "tree_id": "3a31688a87cecec9377bf5261af38d8863a8e8d4",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/137ade8a50686d8dd14717895f9a1aa72a073e52"
        },
        "date": 1736372141531,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 20367.440875,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 17443.615298 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21842.665305000024,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19053.896231000002 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4730.941499999972,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4381.511879 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 73048.134507,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 73048135000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14147.067585,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14147068000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3090299386,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3090299386 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 142052111,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 142052111 ns\nthreads: 1"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "98505400+ledwards2225@users.noreply.github.com",
            "name": "ledwards2225",
            "username": "ledwards2225"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "de9960345da17e97464d2c36c35e3eada4fa3680",
          "message": "feat: permutation argument optimizations  (#10960)\n\nA handful of optimizations for the large ambient trace setting, mostly\nto do with the grand product argument. Total savings is about 1s on the\n\"17 in 20\" benchmark.\n\n- Only perform computation for the grand product on active rows of the\ntrace. This means (1) only setting the values of sigma/id on the active\nrows (they remain zero elsewhere since those values don't contribute to\nthe grand product anyway). And (2) only compute the grand product at\nactive rows then populate the constant regions as a final step. These\nare both facilitated by constructing a vector `active_row_idxs` which\nexplicitly contains the indices of the active rows. This makes it easier\nto multithread and is much more efficient than looping over the entire\ndomain and using something like `check_is_active()` which itself has low\noverhead but results in huge disparities in the distribution of actual\nwork across threads.\n- Replace a default initialized `std::vector` in PG with a `Polynomial`\nsimply to take advantage of the optimized constructor\n\nBranch \"17 in 20\" benchmark\n\n`ClientIVCBench/Full/6      20075 ms        17763 ms`\n\nMaster \"17 in 20\" benchmark\n\n`ClientIVCBench/Full/6      21054 ms        18395 ms`\n\nThe conventional benchmark (\"19 in 19\") shows a very minor improvement,\nas expected:\n\nBranch: \n\n`ClientIVCBench/Full/6      22231 ms        19857 ms`\n\nMaster:\n\n`ClientIVCBench/Full/6      22505 ms        19536 ms`",
          "timestamp": "2025-01-09T10:33:11-07:00",
          "tree_id": "73828bc83a35e049de401d8b3346b10c8b2ba7b5",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/de9960345da17e97464d2c36c35e3eada4fa3680"
        },
        "date": 1736445435828,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 19884.75347799999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 17097.27884 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21838.192907999997,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 18876.969049 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4740.065844000014,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4328.781017000001 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 72406.167237,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 72406168000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14272.296748000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14272298000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3231217012,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3231217012 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 141715859,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 141715859 ns\nthreads: 1"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "fcarreiro@users.noreply.github.com",
            "name": "Facundo",
            "username": "fcarreiro"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "535a14c8c59399ce7579c69f6aec862f71981699",
          "message": "chore(avm): improve column stats (#11135)\n\nNow that we use tight polynomials it makes sense to count things differently for our stats.\n\nI'm gathering info in particular to see if it makes sense to use `commit_sparse` (which we _are_ using now). From what I can see, probably not, or we should do it dynamically based on sparseness information.\n\nStats from the bulk test.\n\n```\nMedian column fullness: 90%\nAverage column fullness: 66%\nFullness of all columns, ignoring empty ones:\n  1: 100%  705: 100%  695: 100%  691: 100%  690: 100%  689: 100%  688: 100%  657: 100%  649: 100%  638: 100%  \n637: 100%  636: 100%  632: 100%  268: 100%  267: 100%  194: 100%    0: 100%   25: 100%   15: 100%   20: 100%  \n 11: 100%    8: 100%    2: 100%   66:  99%  175:  99%   75:  99%   90:  99%  101:  99%  108:  99%  117:  99%  \n136:  99%  149:  99%  150:  99%  153:  99%  156:  99%  157:  99%  158:  99%  176:  99%  177:  99%  178:  99%  \n186:  99%    3:  99%  196:  99%  308:  99%  307:  99%  302:  99%  282:  99%  275:  99%  274:  99%   35:  99%  \n631:  99%  650:  99%   12:  99%   48:  99%    4:  99%  644:  98%  276:  98%  273:  98%    6:  96%  672:  96%  \n666:  96%  673:  96%  658:  95%  120:  94%  139:  92%  141:  92%  143:  92%  140:  92%  144:  92%  121:  92%  \n674:  91%   43:  91%  682:  91%   46:  91%  678:  91%  677:  91%  675:  91%  472:  90%  471:  90%  454:  90%  \n445:  90%  470:  90%  455:  90%  456:  90%  457:  90%  458:  90%  459:  90%  469:  90%  468:  90%  460:  90%  \n461:  90%  467:  90%  466:  90%  465:  90%  462:  90%  463:  90%  464:  90%  485:  90%  497:  90%  496:  90%  \n495:  90%  494:  90%  493:  90%  492:  90%  491:  90%  490:  90%  489:  90%  488:  90%  487:  90%  486:  90%  \n473:  90%  484:  90%  483:  90%  482:  90%  481:  90%  480:  90%  479:  90%  478:  90%  477:  90%  476:  90%  \n475:  90%  474:  90%  401:  90%  426:  90%  425:  90%  424:  90%  423:  90%  422:  90%  421:  90%  400:  90%  \n420:  90%  419:  90%  418:  90%  417:  90%  416:  90%  415:  90%  427:  90%  402:  90%  403:  90%  414:  90%  \n404:  90%  405:  90%  413:  90%  412:  90%  411:  90%  410:  90%  409:  90%  408:  90%  406:  90%  439:  90%  \n452:  90%  451:  90%  450:  90%  449:  90%  448:  90%  447:  90%  446:  90%  407:  90%  444:  90%  443:  90%  \n442:  90%  441:  90%  440:  90%  453:  90%  438:  90%  437:  90%  398:  90%  436:  90%  435:  90%  434:  90%  \n433:  90%  432:  90%  431:  90%  430:  90%  429:  90%  428:  90%  565:  90%  578:  90%  577:  90%  576:  90%  \n575:  90%  574:  90%  573:  90%  572:  90%  571:  90%  570:  90%  569:  90%  568:  90%  567:  90%  566:  90%  \n579:  90%  564:  90%  563:  90%  562:  90%  561:  90%  560:  90%  559:  90%  558:  90%  557:  90%  556:  90%  \n555:  90%  554:  90%  553:  90%  593:  90%  629:  90%  627:  90%  626:  90%  625:  90%  624:  90%  623:  90%  \n622:  90%  621:  90%  620:  90%  619:  90%  618:  90%  617:  90%  594:  90%  552:  90%  592:  90%  591:  90%  \n590:  90%  589:  90%  587:  90%  586:  90%  585:  90%  584:  90%  583:  90%  582:  90%  581:  90%  580:  90%  \n511:  90%  524:  90%  523:  90%  522:  90%  521:  90%  520:  90%  519:  90%  518:  90%  517:  90%  516:  90%  \n515:  90%  514:  90%  513:  90%  512:  90%  525:  90%  510:  90%  509:  90%  508:  90%  507:  90%  506:  90%  \n505:  90%  504:  90%  503:  90%  502:  90%  501:  90%  500:  90%  499:  90%  538:  90%  551:  90%  550:  90%  \n549:  90%  548:  90%  547:  90%  546:  90%  545:  90%  544:  90%  543:  90%  542:  90%  541:  90%  540:  90%  \n539:  90%  498:  90%  537:  90%  536:  90%  535:  90%  534:  90%  533:  90%  532:  90%  531:  90%  530:  90%  \n529:  90%  528:  90%  527:  90%  526:  90%  352:  90%  343:  90%  344:  90%  345:  90%  346:  90%  347:  90%  \n348:  90%  349:  90%  350:  90%  351:  90%  342:  90%  353:  90%  354:  90%  355:  90%  356:  90%  357:  90%  \n358:  90%  359:  90%  360:  90%  333:  90%  399:  90%  326:  90%  327:  90%  328:  90%  329:  90%  330:  90%  \n331:  90%  332:  90%  397:  90%  334:  90%  335:  90%  336:  90%  337:  90%  338:  90%  339:  90%  340:  90%  \n341:  90%  388:  90%  380:  90%  381:  90%  382:  90%  383:  90%  384:  90%  385:  90%  386:  90%  387:  90%  \n362:  90%  389:  90%  390:  90%  391:  90%  392:  90%  393:  90%  394:  90%  395:  90%  396:  90%  378:  90%  \n379:  90%  361:  90%  363:  90%  364:  90%  365:  90%  366:  90%  367:  90%  368:  90%  369:  90%  370:  90%  \n371:  90%  372:  90%  373:  90%  374:  90%  375:  90%  376:  90%  377:  90%   44:  89%  312:  88%  305:  88%  \n 31:  87%   72:  86%  676:  86%   45:  85%  280:  84%  311:  84%   91:  83%  163:  80%  185:  80%  272:  78%  \n190:  74%  199:  74%  182:  73%  187:  70%  132:  70%  125:  70%    5:  66%  197:  65%  180:  63%  119:  63%  \n165:  60%  700:  60%  135:  57%   62:  56%   63:  53%   64:  53%   49:  51%  671:  50%  670:  50%  668:  50%  \n667:  50%  680:  50%   18:  50%  145:  50%  146:  50%  148:  50%  174:  47%  701:  44%  287:  39%  281:  39%  \n 41:  37%  588:  36%  192:  36%  164:  35%  198:  34%  285:  34%  181:  34%   37:  34%   38:  34%  151:  33%  \n651:  33%  652:  33%  642:  32%  653:  32%  654:  32%  635:  32%  655:  32%  656:  32%  122:  29%  201:  28%  \n236:  28%   39:  26%   67:  25%   40:  21%  203:  18%  123:  18%  286:  18%   53:  17%   10:  16%  283:  15%  \n200:  13%  173:  13%  230:  13%  702:  13%  183:  13%  683:  11%  696:  11%   52:  10%  248:   9%  166:   9%  \n 42:   8%   54:   8%  697:   8%    7:   7%  685:   7%  229:   7%  288:   7%  234:   6%  270:   5%   55:   4%  \n235:   3%  278:   3%   33:   3%   71:   3%   56:   3%  167:   3%  693:   3%  218:   3%   50:   3%   28:   2%  \n227:   2%  226:   2%  304:   1%   74:   1%   59:   1%    9:   1%  155:   1%  643:   1%   30:   1%  208:   1%  \n646:   1%  665:   1%  238:   1%  239:   1%  692:   0%   27:   0%  687:   0%   58:   0%  686:   0%   57:   0%  \n684:   0%  704:   0%  660:   0%  659:   0%   47:   0%  703:   0%   51:   0%  694:   0%  258:   0%  241:   0%  \n243:   0%  244:   0%  245:   0%  246:   0%  247:   0%  249:   0%  250:   0%  251:   0%  252:   0%  253:   0%  \n254:   0%  255:   0%  256:   0%  257:   0%  240:   0%  261:   0%  269:   0%  277:   0%  289:   0%  290:   0%  \n291:   0%  292:   0%  293:   0%  294:   0%  295:   0%  296:   0%  297:   0%  303:   0%  309:   0%  212:   0%  \n 68:   0%   73:   0%  152:   0%  160:   0%  161:   0%  162:   0%  188:   0%  189:   0%  195:   0%  204:   0%  \n206:   0%  207:   0%  209:   0%  210:   0%  211:   0%   65:   0%  214:   0%  215:   0%  216:   0%  217:   0%  \n219:   0%  220:   0%  222:   0%  223:   0%  224:   0%  225:   0%  231:   0%  232:   0%  233:   0%  237:   0%  \nDetails for 20 most sparse columns:\nColumn main_sel_op_msm: 2 non-zero entries out of 28048 (0%)\nColumn main_sel_op_l2gasleft: 1 non-zero entries out of 28904 (0%)\nColumn main_sel_op_l1_to_l2_msg_exists: 1 non-zero entries out of 35497 (0%)\nColumn main_sel_op_keccak: 1 non-zero entries out of 14710 (0%)\nColumn main_sel_op_get_contract_instance: 3 non-zero entries out of 28157 (0%)\nColumn main_sel_op_fee_per_l2_gas: 1 non-zero entries out of 28740 (0%)\nColumn main_sel_op_fee_per_da_gas: 1 non-zero entries out of 28825 (0%)\nColumn main_sel_op_fdiv: 40 non-zero entries out of 27798 (0%)\nColumn main_sel_op_external_return: 3 non-zero entries out of 36569 (0%)\nColumn main_sel_op_external_call: 1 non-zero entries out of 35820 (0%)\nColumn main_sel_op_emit_unencrypted_log: 3 non-zero entries out of 35147 (0%)\nColumn main_sel_op_emit_nullifier: 1 non-zero entries out of 35335 (0%)\nColumn main_sel_op_emit_note_hash: 1 non-zero entries out of 35291 (0%)\nColumn main_sel_op_emit_l2_to_l1_msg: 1 non-zero entries out of 35580 (0%)\nColumn alu_remainder: 6 non-zero entries out of 6708 (0%)\nColumn main_sel_op_debug_log: 31 non-zero entries out of 36202 (0%)\nColumn main_sel_op_dagasleft: 1 non-zero entries out of 28983 (0%)\nColumn main_sel_op_chain_id: 1 non-zero entries out of 28426 (0%)\nColumn main_sel_op_calldata_copy: 6 non-zero entries out of 36361 (0%)\nColumn main_sel_op_block_number: 1 non-zero entries out of 28580 (0%)\n```",
          "timestamp": "2025-01-09T19:54:49Z",
          "tree_id": "bbf742f19e4c87e4dcfd7b6e2c5fd14132346f41",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/535a14c8c59399ce7579c69f6aec862f71981699"
        },
        "date": 1736453938176,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 19705.740804000015,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16925.128748000003 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21604.69227300001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 18835.069935 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4649.140547000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4260.5637320000005 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 71873.770908,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 71873771000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14210.19371,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14210193000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3086929751,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3086929751 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 144588502,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 144588502 ns\nthreads: 1"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "sirasistant@gmail.com",
            "name": "Álvaro Rodríguez",
            "username": "sirasistant"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "34be2c3800c2d99c11fe3448e01c77abf60c726d",
          "message": "feat: Use tail public inputs as transaction hash (#11100)\n\nImplements https://github.com/AztecProtocol/aztec-packages/issues/9269\r\nSeparates the role of the first nullifier and the transaction hash. The\r\ntransaction hash is now the hash of the tail public inputs. The first\r\nnullifier is still used for note uniqueness and replayability protection",
          "timestamp": "2025-01-10T13:51:37+01:00",
          "tree_id": "954a1d32e2052bd9ff91868bf26ab420d9a69401",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/34be2c3800c2d99c11fe3448e01c77abf60c726d"
        },
        "date": 1736514455835,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 19509.69868100003,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16789.389673 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21627.030649999993,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19110.811681000003 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4611.245942999972,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4317.705172999999 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 79875.7591,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 79875759000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14137.017693999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14137019000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3067576434,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3067576434 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 142691413,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 142691413 ns\nthreads: 1"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "fcarreiro@users.noreply.github.com",
            "name": "Facundo",
            "username": "fcarreiro"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "1775e53025f9946ba26b8b624a0f15f4ccdabd2f",
          "message": "chore(avm): fix mac build (#11147)\n\nUse bb's format.",
          "timestamp": "2025-01-10T07:52:32-05:00",
          "tree_id": "095d9448e20d5a5621ded9d10f69deb782c7946a",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/1775e53025f9946ba26b8b624a0f15f4ccdabd2f"
        },
        "date": 1736514947594,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 19683.27144099999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16846.750724 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21658.03216400002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 18987.16519 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4657.856092999992,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4270.3855490000005 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 72659.365212,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 72659366000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14205.783152,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14205784000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3097528664,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3097528664 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 141463603,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 141463603 ns\nthreads: 1"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "105737703+iakovenkos@users.noreply.github.com",
            "name": "iakovenkos",
            "username": "iakovenkos"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "f034e2af6f372e393b63ff19ca6d118d03506e1f",
          "message": "chore: SmallSubgroupIPA tests  (#11106)\n\nThis PR is a follow-up to\r\nhttps://github.com/AztecProtocol/aztec-packages/pull/10773",
          "timestamp": "2025-01-10T16:02:56+01:00",
          "tree_id": "de591a29d292670f55a454aff016075fe862cbac",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/f034e2af6f372e393b63ff19ca6d118d03506e1f"
        },
        "date": 1736522376866,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 19702.800213999977,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16957.071715000002 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21603.053388999968,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 18853.246948000004 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4630.27372199997,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4256.731673 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 76677.342763,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 76677343000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14148.409610999997,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14148411000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3148715909,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3148715909 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 145031539,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 145031539 ns\nthreads: 1"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "fcarreiro@users.noreply.github.com",
            "name": "Facundo",
            "username": "fcarreiro"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "231f017d14c3d261b28ab19dcbdf368c561d0cc7",
          "message": "feat(avm2): avm redesign init (#10906)\n\nThis is a redesign of the witgen/proving part of the AVM. There's still a lot of work to be done, but I have to merge at some point to let others contribute :). Most of the content is PoC, not supposed to be real.\n\nWe'll eventually have a doc explaining everything, but for now, some highlights:\n\n**Architecture**\n\nThe proving process is now divided in 3 parts:\n* Simulation (aka event generation): Intrinsically sequential. Executes bytecode and generates packed information (events) that summarize what happened. Examples would be a bytecode decomposition event, memory access event, etc. This part has no dependencies on BB or PIL beyond FF. It also has, in principle, no knowledge of the circuit or columns.\n* Trace generation: This part is parallelizable. The meat of it is translating events into columns in a (sparse!) trace. It is the glue between events and the circuit. It has knowledge of the columns, but not really about any relation or constrain (**) or PIL.\n* Constraining: This is parallelizable. It's the actual constraining/proving/check circuit. It's dependent on BB and the (currently) autogenerated relations from PIL. We convert the sparse trace to polynomials.\n\n**Possible future standalone simulation**\n\nHints and DB accesses: The simulation/witgen process has no knowledge of hints (so far). We define a DB interface which the simulation process uses. This DB is then \"seeded\" with hints. This means that in the future it should be possible to switch the DB to a real DB and things should \"just work™️\".\n\nI think we should try to follow this philosophy as much as possible and not rely on TS hints that we can compute ourselves.\n\nConfigurability: Other aspects of simulation are configurable. E.g., we can configure a fast simulation only variant that does no event generation and no bytecode hashing whereas for full proving you would do that (incurring in at least 25ms for a single bytecode hashing).\n\n**Philosophy**\n\nDependency injection is used everywhere (without framework). You'll see references stored in classes and may not like it, but it's actually working well. See https://www.youtube.com/watch?v=kCYo2gJ3Y38 as well.\n\nThere are lots of interfaces for mocking. Blame C++ 🤷 .\n\nI'm making it a priority to have the right separation of concerns and engineering practices. There's zero tolerance on hacks. If we need a hack, we trigger a refactor.\n\n**Testing**\n\nWhereas before our tests required setting up everything and basically do full proving or check circuit, now everything can be tested separately. We use a mockist approach (common in C++). Our old tests would take ~0.5s each, now they take microseconds. Simulation, tracegen, and constraining can be tested separate from each other. In particular, you can create tests for constraints at the relation or subrelation level.\n\n**Lookups/permutations**\n\nNot really supported yet. But you don't need to keep counts for lookups.\n\n**TS/C++ communication**\n\nAVM inputs are now (de)serialized with messagepack.\n\n(**) It does require lookup/permutation settings.",
          "timestamp": "2025-01-11T20:55:45Z",
          "tree_id": "8f4ae741e32d0a2cb5fb1ef81efd6ce4d8745daf",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/231f017d14c3d261b28ab19dcbdf368c561d0cc7"
        },
        "date": 1736629928863,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 19726.704048999978,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16905.705488 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21543.202395000037,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 18804.36867 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4667.03118800001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4268.412715000001 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 81955.39306799999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 81955394000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14143.177046999997,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14143178000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3337463545,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3337463545 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 155250859,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 155250859 ns\nthreads: 1"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "fcarreiro@users.noreply.github.com",
            "name": "Facundo",
            "username": "fcarreiro"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "6de4013c1204b3478b6d444c0cff5ca9c5c6cd03",
          "message": "chore(avm): vm2 followup cleanup (#11186)",
          "timestamp": "2025-01-13T17:25:48Z",
          "tree_id": "a4773f6dd8d9707bdfe01f80da1bc8a293ce4368",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/6de4013c1204b3478b6d444c0cff5ca9c5c6cd03"
        },
        "date": 1736790146243,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 19902.811792999957,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 17113.066226000003 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21814.849199000037,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19124.121941999998 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4740.052406000018,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4363.102758000001 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 72335.739343,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 72335740000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14250.499486,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14250501000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3666230146,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3666230146 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 152219009,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 152219009 ns\nthreads: 1"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "98505400+ledwards2225@users.noreply.github.com",
            "name": "ledwards2225",
            "username": "ledwards2225"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "d41e9abc8c2428be224400ec43f4844adfd954c3",
          "message": "chore: move witness computation into class plus some other cleanup (#11140)\n\nMinor cleanup/refactor of Flavor logic (particularly MegaFlavor). Mostly\ndeleting unused methods and moving that did not strictly belong in the\nFlavor to new classes `WitnessComputation` and `MegaMemoryEstimator`",
          "timestamp": "2025-01-13T10:50:54-07:00",
          "tree_id": "dd0282685a034e833deb01e1aba778772121189f",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/d41e9abc8c2428be224400ec43f4844adfd954c3"
        },
        "date": 1736792140646,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 19496.567465,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16854.790723000002 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21619.380548000037,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 18885.752178 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4430.973205999976,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4043.220895 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 81710.988247,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 81710989000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 13546.073715,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 13546073000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3712746309,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3712746309 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 157769756,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 157769756 ns\nthreads: 1"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "mara@aztecprotocol.com",
            "name": "maramihali",
            "username": "maramihali"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "58fdf87560fc2c43255675c83dbc36eb370ca5b0",
          "message": "chore: refactor Solidity Transcript and improve error handling in  sol_honk flow (#11158)\n\nA cleanup PR in preparation for the ZK contract\r\n* create a RelationParameters struct so functions in `RelationsLib`\r\ndon't need to take the Transcript as function argument ( this will be\r\nuseful to reuse this library for both the zk and non-zk contract)\r\n* make `loadProof` less manual and more robust by creating some utility\r\nfunctions\r\n* ensure the `sol_honk` flow actually displays contract compilation\r\nerrors and clear errors (if possible) when deploying to aid debugging",
          "timestamp": "2025-01-13T18:10:12Z",
          "tree_id": "57d5e054a68a17745d84b91fa3a6bba6165b74cc",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/58fdf87560fc2c43255675c83dbc36eb370ca5b0"
        },
        "date": 1736793295892,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 19485.702408999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16643.027778 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21680.76442500001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 18908.085911000002 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4477.601942000007,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4187.847456 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 80369.192673,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 80369193000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 13644.3322,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 13644333000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3173461811,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3173461811 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 149391220,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 149391220 ns\nthreads: 1"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "fcarreiro@users.noreply.github.com",
            "name": "Facundo",
            "username": "fcarreiro"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "c4f44520a8cc234219f7e9e021b0574a894aa06e",
          "message": "fix(avm): mac build (#11195)",
          "timestamp": "2025-01-13T18:51:40Z",
          "tree_id": "9bdde1c852ce97f658e0f01f544ef9d7cba3389b",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/c4f44520a8cc234219f7e9e021b0574a894aa06e"
        },
        "date": 1736795826106,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 19021.618668000003,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16178.408088999997 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21630.40817700002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19173.144274 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4074.526970999983,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3763.3456889999998 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 74170.52600499999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 74170527000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14640.452328,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14640453000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3089964160,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3089964160 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 133608330,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 133608330 ns\nthreads: 1"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "47112877+dbanks12@users.noreply.github.com",
            "name": "David Banks",
            "username": "dbanks12"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "3092212d61cb1359d10b1741b48627518e5437d7",
          "message": "chore(avm): re-enable bb-prover tests in CI, change some to check-circuit-only, enable multi-enqueued call tests (#11180)",
          "timestamp": "2025-01-13T15:28:29-05:00",
          "tree_id": "731ea42185078f8e68227e4ba4af8f7c613c1422",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/3092212d61cb1359d10b1741b48627518e5437d7"
        },
        "date": 1736801654614,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 19656.18509799998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16866.072859 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21624.869467999986,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 18756.767578 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4477.594582999984,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4131.163767999999 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 72038.890747,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 72038891000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 13551.805078000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 13551806000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3076701508,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3076701508 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 143002881,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 143002881 ns\nthreads: 1"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "fcarreiro@users.noreply.github.com",
            "name": "Facundo",
            "username": "fcarreiro"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "0a4b763a39fde0f37ac5baa3bd1e3052c01ca946",
          "message": "fix(avm): mac build (retry) (#11197)\n\nPlease read [contributing guidelines](CONTRIBUTING.md) and remove this line.",
          "timestamp": "2025-01-13T20:55:03Z",
          "tree_id": "03cf20b5db15d1076724ffff223c3ca690a8961f",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/0a4b763a39fde0f37ac5baa3bd1e3052c01ca946"
        },
        "date": 1736803163340,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 19638.100054000035,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16898.049203000002 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21589.71449500001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 18931.158215 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4429.515860999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4019.953415 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 71694.107147,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 71694108000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 13539.790007,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 13539790000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3170936703,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3170936703 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 152752627,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 152752627 ns\nthreads: 1"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "132435771+jeanmon@users.noreply.github.com",
            "name": "Jean M",
            "username": "jeanmon"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "2f05dc02fe7b147c7cd6fc235134279dbf332c08",
          "message": "fix(avm): AVM circuit fixes related calldata, returndata and call_ptr (#11207)\n\nThe AVM circuit code did not correctly compute col_offset (defined in\r\nmem_slice.pil) in the context of multiple enqueued calls. In this case,\r\nthe calldata of these top-level calls are concatenated and therefore\r\ncol_offset needs to take into account the previous concatenated\r\ncalldata. We needed also to relax the constraint #[COL_OFFSET_INCREMENT]\r\nwhich needs to be \"reset\" at call boundaries.\r\n\r\nSimilar fix applies for returndata.\r\n\r\nIn addition, we identified some missing call_ptr member in trace row of\r\nseveral opcodes.",
          "timestamp": "2025-01-15T12:00:38+01:00",
          "tree_id": "b36e5fbd90d5dcadb4709b7f428354c704715518",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/2f05dc02fe7b147c7cd6fc235134279dbf332c08"
        },
        "date": 1736939832774,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18981.46464500002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15964.644898 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21595.547462000013,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19208.274018 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4068.078853999992,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3752.102518 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 80074.753179,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 80074753000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14569.986035,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14569986000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3252506078,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3252506078 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 139567856,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 139567856 ns\nthreads: 1"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "60546371+PhilWindle@users.noreply.github.com",
            "name": "PhilWindle",
            "username": "PhilWindle"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "17aa4b4cf2164d29d24d4da29d4b55d273802747",
          "message": "feat: Allow concurrent world state access (#11216)\n\nImplements per-fork queues for requests to the native world state\r\nfollowing it's concurrency rules. Also tightens up aspects of the cached\r\nstore to ensure reads of committed data don't access anything\r\nuncommitted.\r\n\r\n```\r\n1. Reads of committed state never need to be queued. LMDB uses MVCC to ensure readers see a consistent view of the DB.\r\n2. Reads of uncommitted state can happen concurrently with other reads of uncommitted state on the same fork (or reads of committed state)\r\n3. All writes require exclusive access to their respective fork\r\n ```",
          "timestamp": "2025-01-15T15:35:02Z",
          "tree_id": "6d3c54fb931d0cdda99e1f6c0c836e40f27d9f3f",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/17aa4b4cf2164d29d24d4da29d4b55d273802747"
        },
        "date": 1736956354774,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 19332.53660599996,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16409.672425 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21979.59810499998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19107.235116 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4117.8455220000105,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3806.751225 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 75169.475552,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 75169475000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14693.273232,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14693273000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3156390705,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3156390705 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 137016716,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 137016716 ns\nthreads: 1"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "name": "AztecProtocol",
            "username": "AztecProtocol"
          },
          "committer": {
            "name": "AztecProtocol",
            "username": "AztecProtocol"
          },
          "id": "0446fce7b7b9edb58f3f169933163594ffd66b91",
          "message": "chore(master): Release 0.70.0",
          "timestamp": "2025-01-15T18:00:20Z",
          "url": "https://github.com/AztecProtocol/aztec-packages/pull/11107/commits/0446fce7b7b9edb58f3f169933163594ffd66b91"
        },
        "date": 1736964745566,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18832.871579999988,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15962.695484 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21547.46009799999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 18915.530278 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4048.498585999994,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3744.1330009999997 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 75316.450114,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 75316450000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14522.144704999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14522145000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3236149145,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3236149145 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 136362140,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 136362140 ns\nthreads: 1"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "49558828+AztecBot@users.noreply.github.com",
            "name": "Aztec Bot",
            "username": "AztecBot"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "4f06b9772ac99c0ec5dcffe1bc50b0c258f00a32",
          "message": "chore(master): Release 0.70.0 (#11107)\n\n:robot: I have created a release *beep* *boop*\r\n---\r\n\r\n\r\n<details><summary>aztec-package: 0.70.0</summary>\r\n\r\n##\r\n[0.70.0](https://github.com/AztecProtocol/aztec-packages/compare/aztec-package-v0.69.1...aztec-package-v0.70.0)\r\n(2025-01-15)\r\n\r\n\r\n### Features\r\n\r\n* Blob sink in sandbox without extra process\r\n([#11032](https://github.com/AztecProtocol/aztec-packages/issues/11032))\r\n([4600f54](https://github.com/AztecProtocol/aztec-packages/commit/4600f540e519e1b80b4e780491be29707ccf9f40))\r\n* Browser chunking\r\n([#11102](https://github.com/AztecProtocol/aztec-packages/issues/11102))\r\n([393e843](https://github.com/AztecProtocol/aztec-packages/commit/393e8438b082db7d45a45c78e0bf39719b11c56b))\r\n\r\n\r\n### Miscellaneous\r\n\r\n* Greater stability at 1TPS\r\n([#10981](https://github.com/AztecProtocol/aztec-packages/issues/10981))\r\n([1c23662](https://github.com/AztecProtocol/aztec-packages/commit/1c23662f1bbf132680540fbb61afb49b6ead91f5))\r\n* Prover db config\r\n([#11126](https://github.com/AztecProtocol/aztec-packages/issues/11126))\r\n([9d49393](https://github.com/AztecProtocol/aztec-packages/commit/9d49393e66eb38054e0ecf8202aab05919b1bfd4)),\r\ncloses\r\n[#10267](https://github.com/AztecProtocol/aztec-packages/issues/10267)\r\n* Rpc server cleanup & misc fixes\r\n([#11145](https://github.com/AztecProtocol/aztec-packages/issues/11145))\r\n([8a927eb](https://github.com/AztecProtocol/aztec-packages/commit/8a927ebad0c70eaf2aecebbfe9d32eff0990d6f4))\r\n</details>\r\n\r\n<details><summary>barretenberg.js: 0.70.0</summary>\r\n\r\n##\r\n[0.70.0](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg.js-v0.69.1...barretenberg.js-v0.70.0)\r\n(2025-01-15)\r\n\r\n\r\n### Miscellaneous\r\n\r\n* **barretenberg.js:** Synchronize aztec-packages versions\r\n</details>\r\n\r\n<details><summary>aztec-packages: 0.70.0</summary>\r\n\r\n##\r\n[0.70.0](https://github.com/AztecProtocol/aztec-packages/compare/aztec-packages-v0.69.1...aztec-packages-v0.70.0)\r\n(2025-01-15)\r\n\r\n\r\n### ⚠ BREAKING CHANGES\r\n\r\n* disallow calling unconstrained functions outside of `unsafe` blocks\r\nand passing unconstrained functions in place of constrained functions\r\n(https://github.com/noir-lang/noir/pull/6938)\r\n* Disable mocks in `execute`\r\n(https://github.com/noir-lang/noir/pull/6869)\r\n* require trait primitive functions/calls to have their trait in scope\r\n(https://github.com/noir-lang/noir/pull/6901)\r\n* Reserve `enum` and `match` keywords\r\n(https://github.com/noir-lang/noir/pull/6961)\r\n* require trait method calls (`foo.bar()`) to have the trait in scope\r\n(imported) (https://github.com/noir-lang/noir/pull/6895)\r\n* type-check trait default methods\r\n(https://github.com/noir-lang/noir/pull/6645)\r\n* update `aes128_encrypt` to return an array\r\n(https://github.com/noir-lang/noir/pull/6973)\r\n* turn TypeIsMorePrivateThenItem into an error\r\n(https://github.com/noir-lang/noir/pull/6953)\r\n* turn CannotReexportItemWithLessVisibility into an error\r\n(https://github.com/noir-lang/noir/pull/6952)\r\n\r\n### Features\r\n\r\n* `--pedantic-solving` flag\r\n(https://github.com/noir-lang/noir/pull/6716)\r\n([3883a0e](https://github.com/AztecProtocol/aztec-packages/commit/3883a0ead074506ccc263d77477affe017d5c29e))\r\n* 7 bit long `note_type_id`\r\n([#10951](https://github.com/AztecProtocol/aztec-packages/issues/10951))\r\n([6fc5673](https://github.com/AztecProtocol/aztec-packages/commit/6fc56734cbacd743afec9b8e9f37eefb59e31430))\r\n* **avm2:** Avm redesign init\r\n([#10906](https://github.com/AztecProtocol/aztec-packages/issues/10906))\r\n([231f017](https://github.com/AztecProtocol/aztec-packages/commit/231f017d14c3d261b28ab19dcbdf368c561d0cc7))\r\n* Blob sink in sandbox without extra process\r\n([#11032](https://github.com/AztecProtocol/aztec-packages/issues/11032))\r\n([4600f54](https://github.com/AztecProtocol/aztec-packages/commit/4600f540e519e1b80b4e780491be29707ccf9f40))\r\n* Browser chunking\r\n([#11102](https://github.com/AztecProtocol/aztec-packages/issues/11102))\r\n([393e843](https://github.com/AztecProtocol/aztec-packages/commit/393e8438b082db7d45a45c78e0bf39719b11c56b))\r\n* Build blocks using txs with higher fee first\r\n([#11093](https://github.com/AztecProtocol/aztec-packages/issues/11093))\r\n([def7cd7](https://github.com/AztecProtocol/aztec-packages/commit/def7cd7762f45b19c9c94bf7aa42a9c50c46c8fa)),\r\ncloses\r\n[#11084](https://github.com/AztecProtocol/aztec-packages/issues/11084)\r\n* **cli:** Add CLI option to filter by contract function name\r\n(https://github.com/noir-lang/noir/pull/7018)\r\n([9189120](https://github.com/AztecProtocol/aztec-packages/commit/9189120ea510c3bfe824c2e08ba61e7fa5408a97))\r\n* **comptime:** Implement to_be_bits and to_le_bits in the interpreter\r\n(https://github.com/noir-lang/noir/pull/7008)\r\n([9189120](https://github.com/AztecProtocol/aztec-packages/commit/9189120ea510c3bfe824c2e08ba61e7fa5408a97))\r\n* Contract class must be registered before deployment\r\n([#10949](https://github.com/AztecProtocol/aztec-packages/issues/10949))\r\n([7176a70](https://github.com/AztecProtocol/aztec-packages/commit/7176a70de718e2d061d4a86065a6ccb006a54684))\r\n* Dashboard in gcp\r\n([#11201](https://github.com/AztecProtocol/aztec-packages/issues/11201))\r\n([2790bd7](https://github.com/AztecProtocol/aztec-packages/commit/2790bd7382195706d569207a2a48ffe2053cb3ea))\r\n* Disable mocks in `execute`\r\n(https://github.com/noir-lang/noir/pull/6869)\r\n([9189120](https://github.com/AztecProtocol/aztec-packages/commit/9189120ea510c3bfe824c2e08ba61e7fa5408a97))\r\n* Disallow calling unconstrained functions outside of `unsafe` blocks\r\nand passing unconstrained functions in place of constrained functions\r\n(https://github.com/noir-lang/noir/pull/6938)\r\n([9189120](https://github.com/AztecProtocol/aztec-packages/commit/9189120ea510c3bfe824c2e08ba61e7fa5408a97))\r\n* Don't report warnings for dependencies\r\n(https://github.com/noir-lang/noir/pull/6926)\r\n([3883a0e](https://github.com/AztecProtocol/aztec-packages/commit/3883a0ead074506ccc263d77477affe017d5c29e))\r\n* Don't simplify SSA instructions when creating them from a string\r\n(https://github.com/noir-lang/noir/pull/6948)\r\n([3883a0e](https://github.com/AztecProtocol/aztec-packages/commit/3883a0ead074506ccc263d77477affe017d5c29e))\r\n* Expose getL2ToL1Membership on the pxe\r\n([#11215](https://github.com/AztecProtocol/aztec-packages/issues/11215))\r\n([ffd3625](https://github.com/AztecProtocol/aztec-packages/commit/ffd36258b1c5bc8e0823410b19b1774aa58496a1))\r\n* Impl Default for U128 (https://github.com/noir-lang/noir/pull/6984)\r\n([3883a0e](https://github.com/AztecProtocol/aztec-packages/commit/3883a0ead074506ccc263d77477affe017d5c29e))\r\n* Inject protocol nullifier conditionally\r\n([#11155](https://github.com/AztecProtocol/aztec-packages/issues/11155))\r\n([93ade26](https://github.com/AztecProtocol/aztec-packages/commit/93ade26408ace2ddd0d9dfe6ce7100e76c775cc0))\r\n* Kickoff tube circuits at the beginning of proving job\r\n([#11139](https://github.com/AztecProtocol/aztec-packages/issues/11139))\r\n([85d389f](https://github.com/AztecProtocol/aztec-packages/commit/85d389fd8344f2a6cba04ab8d8bd577b9698a0ca)),\r\ncloses\r\n[#10998](https://github.com/AztecProtocol/aztec-packages/issues/10998)\r\n* Lock on Nargo.toml on several nargo commands\r\n(https://github.com/noir-lang/noir/pull/6941)\r\n([3883a0e](https://github.com/AztecProtocol/aztec-packages/commit/3883a0ead074506ccc263d77477affe017d5c29e))\r\n* **lsp:** Use trait method docs for trait impl method docs on hover\r\n(https://github.com/noir-lang/noir/pull/7003)\r\n([9189120](https://github.com/AztecProtocol/aztec-packages/commit/9189120ea510c3bfe824c2e08ba61e7fa5408a97))\r\n* Monitor event loop lag\r\n([#11127](https://github.com/AztecProtocol/aztec-packages/issues/11127))\r\n([422f125](https://github.com/AztecProtocol/aztec-packages/commit/422f125f086c67850cb944ead969409c79ae3a6d))\r\n* Permutation argument optimizations\r\n([#10960](https://github.com/AztecProtocol/aztec-packages/issues/10960))\r\n([de99603](https://github.com/AztecProtocol/aztec-packages/commit/de9960345da17e97464d2c36c35e3eada4fa3680))\r\n* PXE db contract store\r\n([#10867](https://github.com/AztecProtocol/aztec-packages/issues/10867))\r\n([b5d51eb](https://github.com/AztecProtocol/aztec-packages/commit/b5d51ebe8c1c9b0f4104f8f04995018bea2b701a))\r\n* Require trait function calls (`Foo::bar()`) to have the trait in scope\r\n(imported) (https://github.com/noir-lang/noir/pull/6882)\r\n([3883a0e](https://github.com/AztecProtocol/aztec-packages/commit/3883a0ead074506ccc263d77477affe017d5c29e))\r\n* Require trait method calls (`foo.bar()`) to have the trait in scope\r\n(imported) (https://github.com/noir-lang/noir/pull/6895)\r\n([3883a0e](https://github.com/AztecProtocol/aztec-packages/commit/3883a0ead074506ccc263d77477affe017d5c29e))\r\n* Require trait primitive functions/calls to have their trait in scope\r\n(https://github.com/noir-lang/noir/pull/6901)\r\n([9189120](https://github.com/AztecProtocol/aztec-packages/commit/9189120ea510c3bfe824c2e08ba61e7fa5408a97))\r\n* Simulator split\r\n([#11144](https://github.com/AztecProtocol/aztec-packages/issues/11144))\r\n([9b99126](https://github.com/AztecProtocol/aztec-packages/commit/9b99126bb97b1beb1d922a3c404aecdaed0bee69))\r\n* Single tx block root rollup\r\n([#11096](https://github.com/AztecProtocol/aztec-packages/issues/11096))\r\n([bcc0168](https://github.com/AztecProtocol/aztec-packages/commit/bcc01681ed8b1c3ee567258589e776e031fb1884))\r\n* SSA globals in monomorphization and SSA gen\r\n(https://github.com/noir-lang/noir/pull/6985)\r\n([9189120](https://github.com/AztecProtocol/aztec-packages/commit/9189120ea510c3bfe824c2e08ba61e7fa5408a97))\r\n* **ssa:** Immediately simplify away RefCount instructions in ACIR\r\nfunctions (https://github.com/noir-lang/noir/pull/6893)\r\n([3883a0e](https://github.com/AztecProtocol/aztec-packages/commit/3883a0ead074506ccc263d77477affe017d5c29e))\r\n* **test:** Enable the test fuzzer for Wasm\r\n(https://github.com/noir-lang/noir/pull/6835)\r\n([3883a0e](https://github.com/AztecProtocol/aztec-packages/commit/3883a0ead074506ccc263d77477affe017d5c29e))\r\n* Track nodejs runtime metrics\r\n([#11160](https://github.com/AztecProtocol/aztec-packages/issues/11160))\r\n([1d24fab](https://github.com/AztecProtocol/aztec-packages/commit/1d24fab7152b827e91738ff87fb9aef9398c589a))\r\n* Turn CannotReexportItemWithLessVisibility into an error\r\n(https://github.com/noir-lang/noir/pull/6952)\r\n([3883a0e](https://github.com/AztecProtocol/aztec-packages/commit/3883a0ead074506ccc263d77477affe017d5c29e))\r\n* Turn TypeIsMorePrivateThenItem into an error\r\n(https://github.com/noir-lang/noir/pull/6953)\r\n([3883a0e](https://github.com/AztecProtocol/aztec-packages/commit/3883a0ead074506ccc263d77477affe017d5c29e))\r\n* Type-check trait default methods\r\n(https://github.com/noir-lang/noir/pull/6645)\r\n([3883a0e](https://github.com/AztecProtocol/aztec-packages/commit/3883a0ead074506ccc263d77477affe017d5c29e))\r\n* Unchecked math operations in SSA\r\n(https://github.com/noir-lang/noir/pull/7011)\r\n([9189120](https://github.com/AztecProtocol/aztec-packages/commit/9189120ea510c3bfe824c2e08ba61e7fa5408a97))\r\n* Update `aes128_encrypt` to return an array\r\n(https://github.com/noir-lang/noir/pull/6973)\r\n([3883a0e](https://github.com/AztecProtocol/aztec-packages/commit/3883a0ead074506ccc263d77477affe017d5c29e))\r\n* Use tail public inputs as transaction hash\r\n([#11100](https://github.com/AztecProtocol/aztec-packages/issues/11100))\r\n([34be2c3](https://github.com/AztecProtocol/aztec-packages/commit/34be2c3800c2d99c11fe3448e01c77abf60c726d))\r\n* Validator deadline for reexecution\r\n([#11050](https://github.com/AztecProtocol/aztec-packages/issues/11050))\r\n([1aa34e7](https://github.com/AztecProtocol/aztec-packages/commit/1aa34e78f4f40a47f587feecb338d3c2ba108c1d)),\r\ncloses\r\n[#10959](https://github.com/AztecProtocol/aztec-packages/issues/10959)\r\n\r\n\r\n### Bug Fixes\r\n\r\n* Added start/stop guards to running promise and serial queue\r\n([#11120](https://github.com/AztecProtocol/aztec-packages/issues/11120))\r\n([23e642f](https://github.com/AztecProtocol/aztec-packages/commit/23e642f85009a3a4779bc762cf36484771014b57))\r\n* Allow multiple trait impls for the same trait as long as one is in\r\nscope (https://github.com/noir-lang/noir/pull/6987)\r\n([9189120](https://github.com/AztecProtocol/aztec-packages/commit/9189120ea510c3bfe824c2e08ba61e7fa5408a97))\r\n* **avm:** AVM circuit fixes related calldata, returndata and call_ptr\r\n([#11207](https://github.com/AztecProtocol/aztec-packages/issues/11207))\r\n([2f05dc0](https://github.com/AztecProtocol/aztec-packages/commit/2f05dc02fe7b147c7cd6fc235134279dbf332c08))\r\n* **avm:** Mac build\r\n([#11195](https://github.com/AztecProtocol/aztec-packages/issues/11195))\r\n([c4f4452](https://github.com/AztecProtocol/aztec-packages/commit/c4f44520a8cc234219f7e9e021b0574a894aa06e))\r\n* **avm:** Mac build (retry)\r\n([#11197](https://github.com/AztecProtocol/aztec-packages/issues/11197))\r\n([0a4b763](https://github.com/AztecProtocol/aztec-packages/commit/0a4b763a39fde0f37ac5baa3bd1e3052c01ca946))\r\n* Aztec-spartan config var\r\n([#11137](https://github.com/AztecProtocol/aztec-packages/issues/11137))\r\n([acbfad4](https://github.com/AztecProtocol/aztec-packages/commit/acbfad463c2cf8140c7fc6f4272f3b8f3c81f297))\r\n* Blob fees & l1-publisher logging\r\n([#11029](https://github.com/AztecProtocol/aztec-packages/issues/11029))\r\n([c2c0bc6](https://github.com/AztecProtocol/aztec-packages/commit/c2c0bc697312fe4f63337d66b7419b662d9f55ee))\r\n* **bootstrap:** Don't download bad cache if unstaged changes\r\n([#11198](https://github.com/AztecProtocol/aztec-packages/issues/11198))\r\n([2bd895b](https://github.com/AztecProtocol/aztec-packages/commit/2bd895bb0887fddc45433224b3ebef04660f744c))\r\n* **boxes:** Fix attempt 2\r\n([#11175](https://github.com/AztecProtocol/aztec-packages/issues/11175))\r\n([e87b11a](https://github.com/AztecProtocol/aztec-packages/commit/e87b11ac388ef72524e248804902e56b66da061b))\r\n* Bump inotify limits on tester\r\n([#11217](https://github.com/AztecProtocol/aztec-packages/issues/11217))\r\n([60bdf1d](https://github.com/AztecProtocol/aztec-packages/commit/60bdf1da7460303f9a478f83c0f6754e0985118a))\r\n* Do not emit range check for multiplication by bool\r\n(https://github.com/noir-lang/noir/pull/6983)\r\n([3883a0e](https://github.com/AztecProtocol/aztec-packages/commit/3883a0ead074506ccc263d77477affe017d5c29e))\r\n* Do not panic on indices which are not valid `u32`s\r\n(https://github.com/noir-lang/noir/pull/6976)\r\n([3883a0e](https://github.com/AztecProtocol/aztec-packages/commit/3883a0ead074506ccc263d77477affe017d5c29e))\r\n* Docs rebuild patterns\r\n([#11191](https://github.com/AztecProtocol/aztec-packages/issues/11191))\r\n([1999990](https://github.com/AztecProtocol/aztec-packages/commit/1999990417dfaa7a877d8e91f15299defbfa09d2))\r\n* Don't fail parsing macro if there are parser warnings\r\n(https://github.com/noir-lang/noir/pull/6969)\r\n([3883a0e](https://github.com/AztecProtocol/aztec-packages/commit/3883a0ead074506ccc263d77477affe017d5c29e))\r\n* Don't retransmit txs upon node restart\r\n([#11123](https://github.com/AztecProtocol/aztec-packages/issues/11123))\r\n([39535c9](https://github.com/AztecProtocol/aztec-packages/commit/39535c97c6ee70f53709ab03a5b36b256c024048))\r\n* Duplicate env vars\r\n([#11166](https://github.com/AztecProtocol/aztec-packages/issues/11166))\r\n([2507b6f](https://github.com/AztecProtocol/aztec-packages/commit/2507b6fd1e1c79e7f27a2d3c357155670634aad5))\r\n* Error on missing function parameters\r\n(https://github.com/noir-lang/noir/pull/6967)\r\n([3883a0e](https://github.com/AztecProtocol/aztec-packages/commit/3883a0ead074506ccc263d77477affe017d5c29e))\r\n* Get_next_power_exponent off by 1\r\n([#11169](https://github.com/AztecProtocol/aztec-packages/issues/11169))\r\n([80ec19e](https://github.com/AztecProtocol/aztec-packages/commit/80ec19e35017b44f9b2a5267aeb19b7aca38e57e))\r\n* Let static_assert fail with the provided message\r\n(https://github.com/noir-lang/noir/pull/7005)\r\n([9189120](https://github.com/AztecProtocol/aztec-packages/commit/9189120ea510c3bfe824c2e08ba61e7fa5408a97))\r\n* Max_note_len computation\r\n([#10438](https://github.com/AztecProtocol/aztec-packages/issues/10438))\r\n([099c17b](https://github.com/AztecProtocol/aztec-packages/commit/099c17b0c83ef5c0b4368ce2167d3d5422fa0c6e))\r\n* Non-determinism from under constrained checks\r\n(https://github.com/noir-lang/noir/pull/6945)\r\n([3883a0e](https://github.com/AztecProtocol/aztec-packages/commit/3883a0ead074506ccc263d77477affe017d5c29e))\r\n* Prover node aborts execution at epoch end\r\n([#11111](https://github.com/AztecProtocol/aztec-packages/issues/11111))\r\n([2a77616](https://github.com/AztecProtocol/aztec-packages/commit/2a77616d6ef34d64fc8df2629d90d0677c86fe2f)),\r\ncloses\r\n[#10802](https://github.com/AztecProtocol/aztec-packages/issues/10802)\r\n* Prover node does not err upon an empty epoch\r\n([#11204](https://github.com/AztecProtocol/aztec-packages/issues/11204))\r\n([2c3ab84](https://github.com/AztecProtocol/aztec-packages/commit/2c3ab8480583fa1d7df07e985a1495e1db50e1db))\r\n* Remove arch tag in sandbox images\r\n([#11233](https://github.com/AztecProtocol/aztec-packages/issues/11233))\r\n([80a872d](https://github.com/AztecProtocol/aztec-packages/commit/80a872df68b0594d6dab442edcbf963a7c257152))\r\n* Remove max lookup table size constant (for now)\r\n([#11095](https://github.com/AztecProtocol/aztec-packages/issues/11095))\r\n([7e9e268](https://github.com/AztecProtocol/aztec-packages/commit/7e9e2681e314145237f95f79ffdc95ad25a0e319))\r\n* Reproduce and fix bytecode blowup\r\n(https://github.com/noir-lang/noir/pull/6972)\r\n([9189120](https://github.com/AztecProtocol/aztec-packages/commit/9189120ea510c3bfe824c2e08ba61e7fa5408a97))\r\n* Require generic trait impls to be in scope to call them\r\n(https://github.com/noir-lang/noir/pull/6913)\r\n([9189120](https://github.com/AztecProtocol/aztec-packages/commit/9189120ea510c3bfe824c2e08ba61e7fa5408a97))\r\n* Restore upload_logs script in use by acir bench\r\n([2d88497](https://github.com/AztecProtocol/aztec-packages/commit/2d884974e0b7fb13b525c06b7781bb5838537637))\r\n* Return trait impl method as FuncId if there's only one\r\n(https://github.com/noir-lang/noir/pull/6989)\r\n([9189120](https://github.com/AztecProtocol/aztec-packages/commit/9189120ea510c3bfe824c2e08ba61e7fa5408a97))\r\n* Revert \"chore: use L1 Tx Utils\"\r\n([#11167](https://github.com/AztecProtocol/aztec-packages/issues/11167))\r\n([f4e5c79](https://github.com/AztecProtocol/aztec-packages/commit/f4e5c7998c7915923a33e2b26146eebc61775b14))\r\n* Sequencer times out L1 tx at end of L2 slot\r\n([#11112](https://github.com/AztecProtocol/aztec-packages/issues/11112))\r\n([1b88a34](https://github.com/AztecProtocol/aztec-packages/commit/1b88a3446e775a738dee9ea1c442b734cad0dffd))\r\n* Show output of `test_program_is_idempotent` on failure\r\n(https://github.com/noir-lang/noir/pull/6942)\r\n([3883a0e](https://github.com/AztecProtocol/aztec-packages/commit/3883a0ead074506ccc263d77477affe017d5c29e))\r\n* Start RC at 1 again (https://github.com/noir-lang/noir/pull/6958)\r\n([3883a0e](https://github.com/AztecProtocol/aztec-packages/commit/3883a0ead074506ccc263d77477affe017d5c29e))\r\n* Underconstrained bug\r\n([#11174](https://github.com/AztecProtocol/aztec-packages/issues/11174))\r\n([0b3088b](https://github.com/AztecProtocol/aztec-packages/commit/0b3088be1944903410992ccfc462869fde026b93))\r\n* Update fs max user instances for k8s\r\n([#11220](https://github.com/AztecProtocol/aztec-packages/issues/11220))\r\n([b42da6d](https://github.com/AztecProtocol/aztec-packages/commit/b42da6daa0d715afb4259ac7c0a1d6a71adca89d))\r\n* Use absolute path for docker bind in e2e-test\r\n([f2885ec](https://github.com/AztecProtocol/aztec-packages/commit/f2885ec188a6e74afb18e44b8f66c331ab42e108))\r\n* Wrong module to lookup trait when using crate or super\r\n(https://github.com/noir-lang/noir/pull/6974)\r\n([3883a0e](https://github.com/AztecProtocol/aztec-packages/commit/3883a0ead074506ccc263d77477affe017d5c29e))\r\n\r\n\r\n### Miscellaneous\r\n\r\n* Add cli option to specify withdrawer address in the add-l1-validator …\r\n([#11199](https://github.com/AztecProtocol/aztec-packages/issues/11199))\r\n([107f175](https://github.com/AztecProtocol/aztec-packages/commit/107f1754c7fc33cda1c3afb820b3b099745882ed))\r\n* Add memsuspend to parallel in bootstrap\r\n([#11040](https://github.com/AztecProtocol/aztec-packages/issues/11040))\r\n([c78cb82](https://github.com/AztecProtocol/aztec-packages/commit/c78cb82a5ec751437794c34dcfddcd2025e4e3b7))\r\n* Add more Field use info (https://github.com/noir-lang/noir/pull/7019)\r\n([9189120](https://github.com/AztecProtocol/aztec-packages/commit/9189120ea510c3bfe824c2e08ba61e7fa5408a97))\r\n* Add reproduction case for bignum test failure\r\n(https://github.com/noir-lang/noir/pull/6464)\r\n([3883a0e](https://github.com/AztecProtocol/aztec-packages/commit/3883a0ead074506ccc263d77477affe017d5c29e))\r\n* Add short circuit in ssa-gen for known if conditions\r\n(https://github.com/noir-lang/noir/pull/7007)\r\n([9189120](https://github.com/AztecProtocol/aztec-packages/commit/9189120ea510c3bfe824c2e08ba61e7fa5408a97))\r\n* Also print test output to stdout in CI\r\n(https://github.com/noir-lang/noir/pull/6930)\r\n([3883a0e](https://github.com/AztecProtocol/aztec-packages/commit/3883a0ead074506ccc263d77477affe017d5c29e))\r\n* **avm:** Fix mac build\r\n([#11147](https://github.com/AztecProtocol/aztec-packages/issues/11147))\r\n([1775e53](https://github.com/AztecProtocol/aztec-packages/commit/1775e53025f9946ba26b8b624a0f15f4ccdabd2f))\r\n* **avm:** Improve column stats\r\n([#11135](https://github.com/AztecProtocol/aztec-packages/issues/11135))\r\n([535a14c](https://github.com/AztecProtocol/aztec-packages/commit/535a14c8c59399ce7579c69f6aec862f71981699))\r\n* **avm:** Re-enable bb-prover tests in CI, change some to\r\ncheck-circuit-only, enable multi-enqueued call tests\r\n([#11180](https://github.com/AztecProtocol/aztec-packages/issues/11180))\r\n([3092212](https://github.com/AztecProtocol/aztec-packages/commit/3092212d61cb1359d10b1741b48627518e5437d7))\r\n* **avm:** Vm2 followup cleanup\r\n([#11186](https://github.com/AztecProtocol/aztec-packages/issues/11186))\r\n([6de4013](https://github.com/AztecProtocol/aztec-packages/commit/6de4013c1204b3478b6d444c0cff5ca9c5c6cd03))\r\n* Block building benchmark via github-action-benchmark\r\n([#11202](https://github.com/AztecProtocol/aztec-packages/issues/11202))\r\n([c107b6b](https://github.com/AztecProtocol/aztec-packages/commit/c107b6bb84f68d4d9bf8dca604f86fbdc7a8e88c)),\r\ncloses\r\n[#11154](https://github.com/AztecProtocol/aztec-packages/issues/11154)\r\n* Bump `noir-gates-diff` (https://github.com/noir-lang/noir/pull/6943)\r\n([3883a0e](https://github.com/AztecProtocol/aztec-packages/commit/3883a0ead074506ccc263d77477affe017d5c29e))\r\n* Bump `noir-gates-diff` (https://github.com/noir-lang/noir/pull/6944)\r\n([3883a0e](https://github.com/AztecProtocol/aztec-packages/commit/3883a0ead074506ccc263d77477affe017d5c29e))\r\n* Bump `noir-gates-diff` (https://github.com/noir-lang/noir/pull/6949)\r\n([3883a0e](https://github.com/AztecProtocol/aztec-packages/commit/3883a0ead074506ccc263d77477affe017d5c29e))\r\n* Bump arkworks to version `0.5.0`\r\n(https://github.com/noir-lang/noir/pull/6871)\r\n([3883a0e](https://github.com/AztecProtocol/aztec-packages/commit/3883a0ead074506ccc263d77477affe017d5c29e))\r\n* **ci:** Easier to use mac ci\r\n([#11194](https://github.com/AztecProtocol/aztec-packages/issues/11194))\r\n([9ab4cee](https://github.com/AztecProtocol/aztec-packages/commit/9ab4ceeb8dce38c52609623566b9ea424b99825a))\r\n* **ci:** Ensure that prover.toml files in protocol circuits are in sync\r\n([#11141](https://github.com/AztecProtocol/aztec-packages/issues/11141))\r\n([db769bd](https://github.com/AztecProtocol/aztec-packages/commit/db769bd54a1bfb21bc9aeebb5d2baed52599df8e))\r\n* **ci:** Fail properly in `external-repo-checks`\r\n(https://github.com/noir-lang/noir/pull/6988)\r\n([9189120](https://github.com/AztecProtocol/aztec-packages/commit/9189120ea510c3bfe824c2e08ba61e7fa5408a97))\r\n* **ci:** Try fix boxes-test\r\n([#11162](https://github.com/AztecProtocol/aztec-packages/issues/11162))\r\n([a66349f](https://github.com/AztecProtocol/aztec-packages/commit/a66349fa2b60fb397008cd7e0571cc3a3e5fae02))\r\n* Clarity fix in docs (https://github.com/noir-lang/noir/pull/7016)\r\n([9189120](https://github.com/AztecProtocol/aztec-packages/commit/9189120ea510c3bfe824c2e08ba61e7fa5408a97))\r\n* Delete a bunch of dead code from `noirc_evaluator`\r\n(https://github.com/noir-lang/noir/pull/6939)\r\n([3883a0e](https://github.com/AztecProtocol/aztec-packages/commit/3883a0ead074506ccc263d77477affe017d5c29e))\r\n* Delete docs for versions which aren't used\r\n(https://github.com/noir-lang/noir/pull/7020)\r\n([9189120](https://github.com/AztecProtocol/aztec-packages/commit/9189120ea510c3bfe824c2e08ba61e7fa5408a97))\r\n* Disable reorg test\r\n([#11176](https://github.com/AztecProtocol/aztec-packages/issues/11176))\r\n([78bec44](https://github.com/AztecProtocol/aztec-packages/commit/78bec44912790ea8fe35383ea2f29983e36e4557))\r\n* Disallow inserting ACIR-only instructions into brillig functions\r\n(https://github.com/noir-lang/noir/pull/7017)\r\n([9189120](https://github.com/AztecProtocol/aztec-packages/commit/9189120ea510c3bfe824c2e08ba61e7fa5408a97))\r\n* **docs:** Backport 1.0.0-beta.0 doc fixes\r\n(https://github.com/noir-lang/noir/pull/7014)\r\n([9189120](https://github.com/AztecProtocol/aztec-packages/commit/9189120ea510c3bfe824c2e08ba61e7fa5408a97))\r\n* **docs:** Edit Aztec.nr Guide section\r\n([#10866](https://github.com/AztecProtocol/aztec-packages/issues/10866))\r\n([4051ba8](https://github.com/AztecProtocol/aztec-packages/commit/4051ba8f4710fa6fee8f10d42a1deee917525ac9))\r\n* **docs:** Remove node pages\r\n([#11161](https://github.com/AztecProtocol/aztec-packages/issues/11161))\r\n([e494f6b](https://github.com/AztecProtocol/aztec-packages/commit/e494f6b4fab122c436f1e8b1f4b60a038f201e33))\r\n* **docs:** Update tx concepts page\r\n([#10947](https://github.com/AztecProtocol/aztec-packages/issues/10947))\r\n([d9d9798](https://github.com/AztecProtocol/aztec-packages/commit/d9d9798f90cce34ff03cc89d8aa18bb9db0414f1))\r\n* Document aztec-nargo in readme\r\n([#11173](https://github.com/AztecProtocol/aztec-packages/issues/11173))\r\n([927eabf](https://github.com/AztecProtocol/aztec-packages/commit/927eabffed26ca5d243a6c389d62ff28e91c6d1a))\r\n* Greater stability at 1TPS\r\n([#10981](https://github.com/AztecProtocol/aztec-packages/issues/10981))\r\n([1c23662](https://github.com/AztecProtocol/aztec-packages/commit/1c23662f1bbf132680540fbb61afb49b6ead91f5))\r\n* Jest reporters for CI\r\n([#11125](https://github.com/AztecProtocol/aztec-packages/issues/11125))\r\n([90cd9d2](https://github.com/AztecProtocol/aztec-packages/commit/90cd9d22b5da29ef0c989fb9a41f91b9401cc294))\r\n* Log number of instructions executed for call in AVM. Misc fix.\r\n([#11110](https://github.com/AztecProtocol/aztec-packages/issues/11110))\r\n([44e01f4](https://github.com/AztecProtocol/aztec-packages/commit/44e01f4cdd6515990a7233fcb79fc2c01baf46d5))\r\n* Mark `aztec-nr` as expected to compile\r\n(https://github.com/noir-lang/noir/pull/7015)\r\n([9189120](https://github.com/AztecProtocol/aztec-packages/commit/9189120ea510c3bfe824c2e08ba61e7fa5408a97))\r\n* Mark casts as able to be deduplicated\r\n(https://github.com/noir-lang/noir/pull/6996)\r\n([9189120](https://github.com/AztecProtocol/aztec-packages/commit/9189120ea510c3bfe824c2e08ba61e7fa5408a97))\r\n* Missed test account retrieval simplification in one spot\r\n([#11172](https://github.com/AztecProtocol/aztec-packages/issues/11172))\r\n([b72234e](https://github.com/AztecProtocol/aztec-packages/commit/b72234ed0db0652f14044eec5e2899adc5bb7001))\r\n* Move comment as part of\r\n[#6945](https://github.com/AztecProtocol/aztec-packages/issues/6945)\r\n(https://github.com/noir-lang/noir/pull/6959)\r\n([3883a0e](https://github.com/AztecProtocol/aztec-packages/commit/3883a0ead074506ccc263d77477affe017d5c29e))\r\n* Move witness computation into class plus some other cleanup\r\n([#11140](https://github.com/AztecProtocol/aztec-packages/issues/11140))\r\n([d41e9ab](https://github.com/AztecProtocol/aztec-packages/commit/d41e9abc8c2428be224400ec43f4844adfd954c3))\r\n* Nuke unused `getSiblingPath` oracle\r\n([#11090](https://github.com/AztecProtocol/aztec-packages/issues/11090))\r\n([36b640a](https://github.com/AztecProtocol/aztec-packages/commit/36b640aed54fd4da0f9899300bf7b0d05faf5b8d))\r\n* Nuking mental model of \"packing into a hash\"\r\n([#11200](https://github.com/AztecProtocol/aztec-packages/issues/11200))\r\n([e1ebcc0](https://github.com/AztecProtocol/aztec-packages/commit/e1ebcc0b7c0ee2822ff7c203f58c0545647778cc))\r\n* Only resolved globals monomorphization\r\n(https://github.com/noir-lang/noir/pull/7006)\r\n([9189120](https://github.com/AztecProtocol/aztec-packages/commit/9189120ea510c3bfe824c2e08ba61e7fa5408a97))\r\n* Prover db config\r\n([#11126](https://github.com/AztecProtocol/aztec-packages/issues/11126))\r\n([9d49393](https://github.com/AztecProtocol/aztec-packages/commit/9d49393e66eb38054e0ecf8202aab05919b1bfd4)),\r\ncloses\r\n[#10267](https://github.com/AztecProtocol/aztec-packages/issues/10267)\r\n* Redo typo PR by longxiangqiao\r\n([#11109](https://github.com/AztecProtocol/aztec-packages/issues/11109))\r\n([b8ef30e](https://github.com/AztecProtocol/aztec-packages/commit/b8ef30e2a147b5318b70ff2146186dfbae70af42))\r\n* Refactor `get_tx_effects_hash_input_helper`\r\n([#11213](https://github.com/AztecProtocol/aztec-packages/issues/11213))\r\n([5becb99](https://github.com/AztecProtocol/aztec-packages/commit/5becb99dabf9ea75f23cc2b94e96b00f57733175))\r\n* Refactor Solidity Transcript and improve error handling in sol_honk\r\nflow\r\n([#11158](https://github.com/AztecProtocol/aztec-packages/issues/11158))\r\n([58fdf87](https://github.com/AztecProtocol/aztec-packages/commit/58fdf87560fc2c43255675c83dbc36eb370ca5b0))\r\n* Remove explicit collector address\r\n([#11227](https://github.com/AztecProtocol/aztec-packages/issues/11227))\r\n([dfb0db5](https://github.com/AztecProtocol/aztec-packages/commit/dfb0db572868896bea27a13606da2a7e3c10f31e))\r\n* Remove resolve_is_unconstrained pass\r\n(https://github.com/noir-lang/noir/pull/7004)\r\n([9189120](https://github.com/AztecProtocol/aztec-packages/commit/9189120ea510c3bfe824c2e08ba61e7fa5408a97))\r\n* Removing noir bug workaround\r\n([#10535](https://github.com/AztecProtocol/aztec-packages/issues/10535))\r\n([8be882f](https://github.com/AztecProtocol/aztec-packages/commit/8be882f3f00a0652abe1a70709eeb9374a768b22))\r\n* Replace relative paths to noir-protocol-circuits\r\n([d8619fa](https://github.com/AztecProtocol/aztec-packages/commit/d8619faca9b125ce471bd936d9ac297d83754062))\r\n* Replace relative paths to noir-protocol-circuits\r\n([70cad1c](https://github.com/AztecProtocol/aztec-packages/commit/70cad1c01614d8a5d50e76372fef4ed02c7e5407))\r\n* Replace relative paths to noir-protocol-circuits\r\n([e962534](https://github.com/AztecProtocol/aztec-packages/commit/e962534d7d3c98941bede6cfd6247ac9446eca4c))\r\n* Replace relative paths to noir-protocol-circuits\r\n([ba5a589](https://github.com/AztecProtocol/aztec-packages/commit/ba5a589b07639367f80978850871251bde703751))\r\n* Replace relative paths to noir-protocol-circuits\r\n([b7c3fa2](https://github.com/AztecProtocol/aztec-packages/commit/b7c3fa2627408207b975d0d8b738a54a8fa94e2c))\r\n* Replace relative paths to noir-protocol-circuits\r\n([32840c6](https://github.com/AztecProtocol/aztec-packages/commit/32840c62235d8aeeea0ce64385fb6885ad9467f4))\r\n* Require safety doc comment for unsafe instead of\r\n`//[@safety](https://github.com/safety)`\r\n(https://github.com/noir-lang/noir/pull/6992)\r\n([9189120](https://github.com/AztecProtocol/aztec-packages/commit/9189120ea510c3bfe824c2e08ba61e7fa5408a97))\r\n* Reserve `enum` and `match` keywords\r\n(https://github.com/noir-lang/noir/pull/6961)\r\n([9189120](https://github.com/AztecProtocol/aztec-packages/commit/9189120ea510c3bfe824c2e08ba61e7fa5408a97))\r\n* Rpc server cleanup & misc fixes\r\n([#11145](https://github.com/AztecProtocol/aztec-packages/issues/11145))\r\n([8a927eb](https://github.com/AztecProtocol/aztec-packages/commit/8a927ebad0c70eaf2aecebbfe9d32eff0990d6f4))\r\n* Sanity checking of proving job IDs\r\n([#11134](https://github.com/AztecProtocol/aztec-packages/issues/11134))\r\n([61c3e95](https://github.com/AztecProtocol/aztec-packages/commit/61c3e95aaa7fc6c6c4583242cf0263f39b29d084))\r\n* Save kind smoke test logs as artifact\r\n([#11212](https://github.com/AztecProtocol/aztec-packages/issues/11212))\r\n([1389a5b](https://github.com/AztecProtocol/aztec-packages/commit/1389a5b797fd89397a2c53c2b42299dda75bc53e))\r\n* Separate unconstrained functions during monomorphization\r\n(https://github.com/noir-lang/noir/pull/6894)\r\n([3883a0e](https://github.com/AztecProtocol/aztec-packages/commit/3883a0ead074506ccc263d77477affe017d5c29e))\r\n* Simplify a couple of enum variants\r\n(https://github.com/noir-lang/noir/pull/7025)\r\n([9189120](https://github.com/AztecProtocol/aztec-packages/commit/9189120ea510c3bfe824c2e08ba61e7fa5408a97))\r\n* Simplify boolean in a mul of a mul\r\n(https://github.com/noir-lang/noir/pull/6951)\r\n([3883a0e](https://github.com/AztecProtocol/aztec-packages/commit/3883a0ead074506ccc263d77477affe017d5c29e))\r\n* SmallSubgroupIPA tests\r\n([#11106](https://github.com/AztecProtocol/aztec-packages/issues/11106))\r\n([f034e2a](https://github.com/AztecProtocol/aztec-packages/commit/f034e2af6f372e393b63ff19ca6d118d03506e1f))\r\n* **spartan:** Making the spartan script install jq\r\n([#11231](https://github.com/AztecProtocol/aztec-packages/issues/11231))\r\n([7e628cc](https://github.com/AztecProtocol/aztec-packages/commit/7e628cc5785ba26683ddd0a3aa20348adfa37cef))\r\n* Test:e2e defaults to no-docker\r\n([#10966](https://github.com/AztecProtocol/aztec-packages/issues/10966))\r\n([15e0d71](https://github.com/AztecProtocol/aztec-packages/commit/15e0d71c49161faa2e1bfb152be8af8f6ee65268))\r\n* Turn on averaging for protocol circuits metrics in CI\r\n(https://github.com/noir-lang/noir/pull/6999)\r\n([9189120](https://github.com/AztecProtocol/aztec-packages/commit/9189120ea510c3bfe824c2e08ba61e7fa5408a97))\r\n* Update aztec-spartan.sh script\r\n([#11228](https://github.com/AztecProtocol/aztec-packages/issues/11228))\r\n([52b3a87](https://github.com/AztecProtocol/aztec-packages/commit/52b3a873d3b6cc91d46e22b50e5f367c1828c74b))\r\n* Use DFG in SSA printer (https://github.com/noir-lang/noir/pull/6986)\r\n([9189120](https://github.com/AztecProtocol/aztec-packages/commit/9189120ea510c3bfe824c2e08ba61e7fa5408a97))\r\n* Use L1 Tx Utils\r\n([#10759](https://github.com/AztecProtocol/aztec-packages/issues/10759))\r\n([ccf28f5](https://github.com/AztecProtocol/aztec-packages/commit/ccf28f56c408381867a4ac9435c5f0cc46690271)),\r\ncloses\r\n[#10464](https://github.com/AztecProtocol/aztec-packages/issues/10464)\r\n* Use logs for benchmarking\r\n(https://github.com/noir-lang/noir/pull/6911)\r\n([3883a0e](https://github.com/AztecProtocol/aztec-packages/commit/3883a0ead074506ccc263d77477affe017d5c29e))\r\n* VariableMerkleTree readability improvements\r\n([#11165](https://github.com/AztecProtocol/aztec-packages/issues/11165))\r\n([010d1b0](https://github.com/AztecProtocol/aztec-packages/commit/010d1b0717bae313938de62c9c26df8bef7375b5))\r\n* Wait for ethereum in each pod\r\n([#11238](https://github.com/AztecProtocol/aztec-packages/issues/11238))\r\n([9c08e00](https://github.com/AztecProtocol/aztec-packages/commit/9c08e00d0b297d08f923c96533e24c19f48f565b))\r\n\r\n\r\n### Documentation\r\n\r\n* Enable protocol specs for docs in dev mode\r\n([#11219](https://github.com/AztecProtocol/aztec-packages/issues/11219))\r\n([10c8afe](https://github.com/AztecProtocol/aztec-packages/commit/10c8afed6ea5fd186e4f14820c4eb259cba85460))\r\n</details>\r\n\r\n<details><summary>barretenberg: 0.70.0</summary>\r\n\r\n##\r\n[0.70.0](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.69.1...barretenberg-v0.70.0)\r\n(2025-01-15)\r\n\r\n\r\n### Features\r\n\r\n* **avm2:** Avm redesign init\r\n([#10906](https://github.com/AztecProtocol/aztec-packages/issues/10906))\r\n([231f017](https://github.com/AztecProtocol/aztec-packages/commit/231f017d14c3d261b28ab19dcbdf368c561d0cc7))\r\n* Permutation argument optimizations\r\n([#10960](https://github.com/AztecProtocol/aztec-packages/issues/10960))\r\n([de99603](https://github.com/AztecProtocol/aztec-packages/commit/de9960345da17e97464d2c36c35e3eada4fa3680))\r\n* Use tail public inputs as transaction hash\r\n([#11100](https://github.com/AztecProtocol/aztec-packages/issues/11100))\r\n([34be2c3](https://github.com/AztecProtocol/aztec-packages/commit/34be2c3800c2d99c11fe3448e01c77abf60c726d))\r\n\r\n\r\n### Bug Fixes\r\n\r\n* **avm:** AVM circuit fixes related calldata, returndata and call_ptr\r\n([#11207](https://github.com/AztecProtocol/aztec-packages/issues/11207))\r\n([2f05dc0](https://github.com/AztecProtocol/aztec-packages/commit/2f05dc02fe7b147c7cd6fc235134279dbf332c08))\r\n* **avm:** Mac build\r\n([#11195](https://github.com/AztecProtocol/aztec-packages/issues/11195))\r\n([c4f4452](https://github.com/AztecProtocol/aztec-packages/commit/c4f44520a8cc234219f7e9e021b0574a894aa06e))\r\n* **avm:** Mac build (retry)\r\n([#11197](https://github.com/AztecProtocol/aztec-packages/issues/11197))\r\n([0a4b763](https://github.com/AztecProtocol/aztec-packages/commit/0a4b763a39fde0f37ac5baa3bd1e3052c01ca946))\r\n* **bootstrap:** Don't download bad cache if unstaged changes\r\n([#11198](https://github.com/AztecProtocol/aztec-packages/issues/11198))\r\n([2bd895b](https://github.com/AztecProtocol/aztec-packages/commit/2bd895bb0887fddc45433224b3ebef04660f744c))\r\n* Remove max lookup table size constant (for now)\r\n([#11095](https://github.com/AztecProtocol/aztec-packages/issues/11095))\r\n([7e9e268](https://github.com/AztecProtocol/aztec-packages/commit/7e9e2681e314145237f95f79ffdc95ad25a0e319))\r\n\r\n\r\n### Miscellaneous\r\n\r\n* **avm:** Fix mac build\r\n([#11147](https://github.com/AztecProtocol/aztec-packages/issues/11147))\r\n([1775e53](https://github.com/AztecProtocol/aztec-packages/commit/1775e53025f9946ba26b8b624a0f15f4ccdabd2f))\r\n* **avm:** Improve column stats\r\n([#11135](https://github.com/AztecProtocol/aztec-packages/issues/11135))\r\n([535a14c](https://github.com/AztecProtocol/aztec-packages/commit/535a14c8c59399ce7579c69f6aec862f71981699))\r\n* **avm:** Re-enable bb-prover tests in CI, change some to\r\ncheck-circuit-only, enable multi-enqueued call tests\r\n([#11180](https://github.com/AztecProtocol/aztec-packages/issues/11180))\r\n([3092212](https://github.com/AztecProtocol/aztec-packages/commit/3092212d61cb1359d10b1741b48627518e5437d7))\r\n* **avm:** Vm2 followup cleanup\r\n([#11186](https://github.com/AztecProtocol/aztec-packages/issues/11186))\r\n([6de4013](https://github.com/AztecProtocol/aztec-packages/commit/6de4013c1204b3478b6d444c0cff5ca9c5c6cd03))\r\n* **docs:** Update tx concepts page\r\n([#10947](https://github.com/AztecProtocol/aztec-packages/issues/10947))\r\n([d9d9798](https://github.com/AztecProtocol/aztec-packages/commit/d9d9798f90cce34ff03cc89d8aa18bb9db0414f1))\r\n* Move witness computation into class plus some other cleanup\r\n([#11140](https://github.com/AztecProtocol/aztec-packages/issues/11140))\r\n([d41e9ab](https://github.com/AztecProtocol/aztec-packages/commit/d41e9abc8c2428be224400ec43f4844adfd954c3))\r\n* Redo typo PR by longxiangqiao\r\n([#11109](https://github.com/AztecProtocol/aztec-packages/issues/11109))\r\n([b8ef30e](https://github.com/AztecProtocol/aztec-packages/commit/b8ef30e2a147b5318b70ff2146186dfbae70af42))\r\n* Refactor Solidity Transcript and improve error handling in sol_honk\r\nflow\r\n([#11158](https://github.com/AztecProtocol/aztec-packages/issues/11158))\r\n([58fdf87](https://github.com/AztecProtocol/aztec-packages/commit/58fdf87560fc2c43255675c83dbc36eb370ca5b0))\r\n* SmallSubgroupIPA tests\r\n([#11106](https://github.com/AztecProtocol/aztec-packages/issues/11106))\r\n([f034e2a](https://github.com/AztecProtocol/aztec-packages/commit/f034e2af6f372e393b63ff19ca6d118d03506e1f))\r\n</details>\r\n\r\n---\r\nThis PR was generated with [Release\r\nPlease](https://github.com/googleapis/release-please). See\r\n[documentation](https://github.com/googleapis/release-please#release-please).",
          "timestamp": "2025-01-15T18:00:15Z",
          "tree_id": "fb9bdf1ec621d83dbff8e4c8bbae9f5cb818cd78",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/4f06b9772ac99c0ec5dcffe1bc50b0c258f00a32"
        },
        "date": 1736965017768,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 19258.611547999975,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16332.142032 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21548.118154999996,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 18842.53069 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4064.9877449999963,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3756.2475400000003 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 73946.0988,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 73946100000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14560.696064000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14560697000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3439077931,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3439077931 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 138935166,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 138935166 ns\nthreads: 1"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "47112877+dbanks12@users.noreply.github.com",
            "name": "David Banks",
            "username": "dbanks12"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "29bc4bdd5b59ee1050951e0c143654ef3cdd25b0",
          "message": "fix: resolve misc bugs handling phases in avm witgen (#11218)\n\n* At the end of teardown, witgen needs to reset gas back to parent's end\ngas.\n* Make sure that order of enqueued calls is right in TX for bb-prover\ntests (should be a stack)\n* Add a test that reverts in teardown and can still be proven",
          "timestamp": "2025-01-15T20:47:53-05:00",
          "tree_id": "d7053ba6d77d627e2e00a99e681b4af89b9db362",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/29bc4bdd5b59ee1050951e0c143654ef3cdd25b0"
        },
        "date": 1736993037779,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 19275.749757,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16459.422211 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21755.228163000025,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19269.637791 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4085.3707659999827,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3755.367747 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 85896.261767,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 85896262000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14658.592575000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14658593000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3186801836,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3186801836 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 140395392,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 140395392 ns\nthreads: 1"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "mara@aztecprotocol.com",
            "name": "maramihali",
            "username": "maramihali"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "507ae9df9c369603da20f25ccc228729ee2733cd",
          "message": "chore:  move shared pcs functionality to internal library in solidity and small refactorings in sumcheck (#11230)\n\n* functionality that is shared in PCS between the ZK and non-ZK contract\r\nhas been moved to a separate internal library.\r\n* simplified ZK sumcheck and pcs logic",
          "timestamp": "2025-01-16T13:49:22Z",
          "tree_id": "0e2de66dabc433e3e0a421e6157821ddac7af3a8",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/507ae9df9c369603da20f25ccc228729ee2733cd"
        },
        "date": 1737036320369,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 19000.743424999997,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16130.476988000002 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21541.346078999966,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19117.154511999997 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4078.367284999985,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3768.6865319999993 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 83965.810647,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 83965810000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14609.333038,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14609333000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3066862317,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3066862317 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 134279785,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 134279785 ns\nthreads: 1"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "132435771+jeanmon@users.noreply.github.com",
            "name": "Jean M",
            "username": "jeanmon"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "a469c94ccfa37723aa79f132e55c31ae7c4c6693",
          "message": "chore(avm): calldata, returndata slices out of range padded with zeros (#11265)\n\nResolves #10933",
          "timestamp": "2025-01-16T17:29:15Z",
          "tree_id": "38afde1265f7e877d449ee559e1786c5c6fc100c",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/a469c94ccfa37723aa79f132e55c31ae7c4c6693"
        },
        "date": 1737049529913,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 19154.191516,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16258.402495000002 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21628.268425000017,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19131.148368000002 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4079.3666440000325,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3762.259468 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 74231.71791,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 74231718000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14621.269873,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14621271000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3124123562,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3124123562 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 135321411,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 135321411 ns\nthreads: 1"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "lucasxia01@gmail.com",
            "name": "Lucas Xia",
            "username": "lucasxia01"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "8fc2011fbe0e3545924898a53e851279b8cc0084",
          "message": "fix: Reallocate commitment key to avoid pippenger error (#11249)\n\nFixes recent bug introduced by the SmallSubgroupIPA work which added an\r\nedge case where we always commit to polynomials of some fixed degree (of\r\n259 or whatever). Pippenger was set up to work for circuit_size amount\r\nof points, which could be lower than the SmallSubgroupIPA poly sizes, so\r\nit led to buffer overflows.\r\n\r\nFixes it by reallocating commitment key if necessary in SmallSubgroupIPA\r\nprover. Also adds an assert to commit() to check for any potential\r\noverflows.",
          "timestamp": "2025-01-16T20:48:50Z",
          "tree_id": "0de09b9fee4310a0b72681bb3e5959da428e840b",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/8fc2011fbe0e3545924898a53e851279b8cc0084"
        },
        "date": 1737062084190,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 20000.256567999997,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16987.316242999997 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 22658.276625999973,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 20024.910694 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4256.645685000023,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3906.7042120000006 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 74261.96217600002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 74261961000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14884.678045,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14884679000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3100965554,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3100965554 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 134928807,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 134928807 ns\nthreads: 1"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "name": "AztecProtocol",
            "username": "AztecProtocol"
          },
          "committer": {
            "name": "AztecProtocol",
            "username": "AztecProtocol"
          },
          "id": "a4f9169657beb4e8bf2411b26f4069516b0e9531",
          "message": "chore(master): Release 0.71.0",
          "timestamp": "2025-01-17T17:02:19Z",
          "url": "https://github.com/AztecProtocol/aztec-packages/pull/11247/commits/a4f9169657beb4e8bf2411b26f4069516b0e9531"
        },
        "date": 1737134006667,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18836.50583100001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15933.004078 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21390.992309000012,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 18982.980503 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4042.190370999975,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3685.672178 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 73519.047903,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 73519049000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14508.577811,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14508579000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3055457303,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3055457303 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 134157800,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 134157800 ns\nthreads: 1"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "49558828+AztecBot@users.noreply.github.com",
            "name": "Aztec Bot",
            "username": "AztecBot"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "232c34e849fa205a64123687f9fa4f70ce07292c",
          "message": "chore(master): Release 0.71.0 (#11247)\n\n:robot: I have created a release *beep* *boop*\r\n---\r\n\r\n\r\n<details><summary>aztec-package: 0.71.0</summary>\r\n\r\n##\r\n[0.71.0](https://github.com/AztecProtocol/aztec-packages/compare/aztec-package-v0.70.0...aztec-package-v0.71.0)\r\n(2025-01-17)\r\n\r\n\r\n### Features\r\n\r\n* Track block building helpers\r\n([#11190](https://github.com/AztecProtocol/aztec-packages/issues/11190))\r\n([a749dc1](https://github.com/AztecProtocol/aztec-packages/commit/a749dc1656c0b4d1b0715dae90883b800be591ca)),\r\ncloses\r\n[#11184](https://github.com/AztecProtocol/aztec-packages/issues/11184)\r\n</details>\r\n\r\n<details><summary>barretenberg.js: 0.71.0</summary>\r\n\r\n##\r\n[0.71.0](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg.js-v0.70.0...barretenberg.js-v0.71.0)\r\n(2025-01-17)\r\n\r\n\r\n### Miscellaneous\r\n\r\n* **barretenberg.js:** Synchronize aztec-packages versions\r\n</details>\r\n\r\n<details><summary>aztec-packages: 0.71.0</summary>\r\n\r\n##\r\n[0.71.0](https://github.com/AztecProtocol/aztec-packages/compare/aztec-packages-v0.70.0...aztec-packages-v0.71.0)\r\n(2025-01-17)\r\n\r\n\r\n### ⚠ BREAKING CHANGES\r\n\r\n* `loop` statements (only frontend)\r\n(https://github.com/noir-lang/noir/pull/7092)\r\n* Include kind in `StructDefinition::generics` and fix derivation of Eq\r\nin structs with numeric generics\r\n(https://github.com/noir-lang/noir/pull/7076)\r\n* Attestation collection times out based on sequencer timetable\r\n([#11248](https://github.com/AztecProtocol/aztec-packages/issues/11248))\r\n\r\n### Features\r\n\r\n* `loop` statements (only frontend)\r\n(https://github.com/noir-lang/noir/pull/7092)\r\n([a964cd0](https://github.com/AztecProtocol/aztec-packages/commit/a964cd075b97c45a526bfb81ba612b6eb077a29f))\r\n* Add `ConstrainNotEqual` instruction\r\n(https://github.com/noir-lang/noir/pull/7032)\r\n([a964cd0](https://github.com/AztecProtocol/aztec-packages/commit/a964cd075b97c45a526bfb81ba612b6eb077a29f))\r\n* Archive public testnet tx data\r\n([#11192](https://github.com/AztecProtocol/aztec-packages/issues/11192))\r\n([66f2014](https://github.com/AztecProtocol/aztec-packages/commit/66f2014fa67bbbcd7ae277a414a46a123f3797f2))\r\n* Backup proof failures to google cloud storage\r\n([#11255](https://github.com/AztecProtocol/aztec-packages/issues/11255))\r\n([b4775fd](https://github.com/AztecProtocol/aztec-packages/commit/b4775fd9c223eaab411c1c8ab2344291e876b92a)),\r\ncloses\r\n[#11062](https://github.com/AztecProtocol/aztec-packages/issues/11062)\r\n* **docs:** Algolia-&gt;typesense\r\n([#11034](https://github.com/AztecProtocol/aztec-packages/issues/11034))\r\n([d254f49](https://github.com/AztecProtocol/aztec-packages/commit/d254f497345ef4dd69d5cfdb58705c34e58a65cf))\r\n* Improve PXE contract DB capabilities\r\n([#11303](https://github.com/AztecProtocol/aztec-packages/issues/11303))\r\n([fab5570](https://github.com/AztecProtocol/aztec-packages/commit/fab557065065ac25403dff15adb828011fc849f4))\r\n* **LSP:** Auto-import trait reexport if trait is not visible\r\n(https://github.com/noir-lang/noir/pull/7079)\r\n([a964cd0](https://github.com/AztecProtocol/aztec-packages/commit/a964cd075b97c45a526bfb81ba612b6eb077a29f))\r\n* Process note logs in aztec-nr\r\n([#10651](https://github.com/AztecProtocol/aztec-packages/issues/10651))\r\n([708139d](https://github.com/AztecProtocol/aztec-packages/commit/708139d2a30dbafe38171e826ac7462c20d2c5d9))\r\n* Reenable constrained config for roots\r\n([#10605](https://github.com/AztecProtocol/aztec-packages/issues/10605))\r\n([a6ebc2e](https://github.com/AztecProtocol/aztec-packages/commit/a6ebc2e7dc453e55ad3b3872f1d78b9fa0b8abdf))\r\n* **spartan:** Add extra accounts\r\n([#11300](https://github.com/AztecProtocol/aztec-packages/issues/11300))\r\n([7782836](https://github.com/AztecProtocol/aztec-packages/commit/77828365f35a6ac6068c7ac87601758264e0c2eb))\r\n* **ssa:** Treat globals as constant in a function's DFG\r\n(https://github.com/noir-lang/noir/pull/7040)\r\n([a964cd0](https://github.com/AztecProtocol/aztec-packages/commit/a964cd075b97c45a526bfb81ba612b6eb077a29f))\r\n* Track block building helpers\r\n([#11190](https://github.com/AztecProtocol/aztec-packages/issues/11190))\r\n([a749dc1](https://github.com/AztecProtocol/aztec-packages/commit/a749dc1656c0b4d1b0715dae90883b800be591ca)),\r\ncloses\r\n[#11184](https://github.com/AztecProtocol/aztec-packages/issues/11184)\r\n\r\n\r\n### Bug Fixes\r\n\r\n* Allow implicit associated types on integer type kinds\r\n(https://github.com/noir-lang/noir/pull/7078)\r\n([a964cd0](https://github.com/AztecProtocol/aztec-packages/commit/a964cd075b97c45a526bfb81ba612b6eb077a29f))\r\n* Do not remove memory blocks used as brillig input\r\n(https://github.com/noir-lang/noir/pull/7073)\r\n([a964cd0](https://github.com/AztecProtocol/aztec-packages/commit/a964cd075b97c45a526bfb81ba612b6eb077a29f))\r\n* Ensure 'docker info' works before preceding\r\n([#11286](https://github.com/AztecProtocol/aztec-packages/issues/11286))\r\n([0b0e81a](https://github.com/AztecProtocol/aztec-packages/commit/0b0e81a2255669c52a474e9ec0471dcc7d3e6fbb))\r\n* Fail in proxy deployment should fail the step\r\n([#11308](https://github.com/AztecProtocol/aztec-packages/issues/11308))\r\n([b780d75](https://github.com/AztecProtocol/aztec-packages/commit/b780d751c40a235831308bbac4c6425a7b211329))\r\n* Faster polling times for archiver and sequencer\r\n([#11262](https://github.com/AztecProtocol/aztec-packages/issues/11262))\r\n([d70511e](https://github.com/AztecProtocol/aztec-packages/commit/d70511e550eb9b1aaf8d59003f14e01ce02a9b68))\r\n* Https://github.com/AztecProtocol/aztec-packages/issues/8939\r\n([66f2014](https://github.com/AztecProtocol/aztec-packages/commit/66f2014fa67bbbcd7ae277a414a46a123f3797f2))\r\n* Idempotent deploy-l1-contracts with initial validators\r\n([#11284](https://github.com/AztecProtocol/aztec-packages/issues/11284))\r\n([3a3f9c0](https://github.com/AztecProtocol/aztec-packages/commit/3a3f9c0dbd6dff9bb96c2b326ee7cf99fb0547d7)),\r\ncloses\r\n[#11283](https://github.com/AztecProtocol/aztec-packages/issues/11283)\r\n* Include kind in `StructDefinition::generics` and fix derivation of Eq\r\nin structs with numeric generics\r\n(https://github.com/noir-lang/noir/pull/7076)\r\n([a964cd0](https://github.com/AztecProtocol/aztec-packages/commit/a964cd075b97c45a526bfb81ba612b6eb077a29f))\r\n* Legacy runner start\r\n([#11291](https://github.com/AztecProtocol/aztec-packages/issues/11291))\r\n([0b2a619](https://github.com/AztecProtocol/aztec-packages/commit/0b2a61901d183ffe6389a6543a379acfef25c5e5))\r\n* Reallocate commitment key to avoid pippenger error\r\n([#11249](https://github.com/AztecProtocol/aztec-packages/issues/11249))\r\n([8fc2011](https://github.com/AztecProtocol/aztec-packages/commit/8fc2011fbe0e3545924898a53e851279b8cc0084))\r\n* References to a3 in docs\r\n([#11256](https://github.com/AztecProtocol/aztec-packages/issues/11256))\r\n([caf88fa](https://github.com/AztecProtocol/aztec-packages/commit/caf88fa45d32c9174e033f6c1124cf5b5d06f827))\r\n* Remove bb path override in cli-wallet\r\n([#11280](https://github.com/AztecProtocol/aztec-packages/issues/11280))\r\n([a6a226e](https://github.com/AztecProtocol/aztec-packages/commit/a6a226ee3c6d547a1c444856039b776444576a9b))\r\n* Resolve misc bugs handling phases in avm witgen\r\n([#11218](https://github.com/AztecProtocol/aztec-packages/issues/11218))\r\n([29bc4bd](https://github.com/AztecProtocol/aztec-packages/commit/29bc4bdd5b59ee1050951e0c143654ef3cdd25b0))\r\n* Sequencer timetable accounts for spare time\r\n([#11221](https://github.com/AztecProtocol/aztec-packages/issues/11221))\r\n([f1b9211](https://github.com/AztecProtocol/aztec-packages/commit/f1b92112b7063af80044a2b3bc6daa98a8446d9f))\r\n* Validator ignores block limits during reexec\r\n([#11288](https://github.com/AztecProtocol/aztec-packages/issues/11288))\r\n([920a521](https://github.com/AztecProtocol/aztec-packages/commit/920a521ddd99dc6f15411191819c507139793374))\r\n\r\n\r\n### Miscellaneous\r\n\r\n* Add circuit input checks to bootstrap.sh\r\n([#11261](https://github.com/AztecProtocol/aztec-packages/issues/11261))\r\n([a718b15](https://github.com/AztecProtocol/aztec-packages/commit/a718b15c17793d3768b7656329b10c923380971e))\r\n* Add regression test for\r\n[#6530](https://github.com/AztecProtocol/aztec-packages/issues/6530)\r\n(https://github.com/noir-lang/noir/pull/7089)\r\n([a964cd0](https://github.com/AztecProtocol/aztec-packages/commit/a964cd075b97c45a526bfb81ba612b6eb077a29f))\r\n* Add test for isuee\r\n[#7090](https://github.com/AztecProtocol/aztec-packages/issues/7090)\r\n(https://github.com/noir-lang/noir/pull/7091)\r\n([a964cd0](https://github.com/AztecProtocol/aztec-packages/commit/a964cd075b97c45a526bfb81ba612b6eb077a29f))\r\n* Allow passing custom conditions to inlining pass\r\n(https://github.com/noir-lang/noir/pull/7083)\r\n([a964cd0](https://github.com/AztecProtocol/aztec-packages/commit/a964cd075b97c45a526bfb81ba612b6eb077a29f))\r\n* Attestation collection times out based on sequencer timetable\r\n([#11248](https://github.com/AztecProtocol/aztec-packages/issues/11248))\r\n([946a418](https://github.com/AztecProtocol/aztec-packages/commit/946a418d138c1b2bee3a5dc14096616a902cc0b7))\r\n* **avm:** Calldata, returndata slices out of range padded with zeros\r\n([#11265](https://github.com/AztecProtocol/aztec-packages/issues/11265))\r\n([a469c94](https://github.com/AztecProtocol/aztec-packages/commit/a469c94ccfa37723aa79f132e55c31ae7c4c6693)),\r\ncloses\r\n[#10933](https://github.com/AztecProtocol/aztec-packages/issues/10933)\r\n* Delete external-ci-approved.yml\r\n([#11258](https://github.com/AztecProtocol/aztec-packages/issues/11258))\r\n([642bce6](https://github.com/AztecProtocol/aztec-packages/commit/642bce68a3e0eea29fa3ebb8c11cf4af02fe992b))\r\n* Demote error closing forks to warn\r\n([#11263](https://github.com/AztecProtocol/aztec-packages/issues/11263))\r\n([a5b7a6a](https://github.com/AztecProtocol/aztec-packages/commit/a5b7a6ae4ec9fbe68cfd5b8216a5a4501077baa0))\r\n* Do not make new instruction if it hasn't changed\r\n(https://github.com/noir-lang/noir/pull/7069)\r\n([a964cd0](https://github.com/AztecProtocol/aztec-packages/commit/a964cd075b97c45a526bfb81ba612b6eb077a29f))\r\n* Ensure devnet has unproven config\r\n([#11302](https://github.com/AztecProtocol/aztec-packages/issues/11302))\r\n([085f782](https://github.com/AztecProtocol/aztec-packages/commit/085f782f34ebbe931cc01f5e80f52d916554dff9))\r\n* Fixing `[@safety](https://github.com/safety)` warnings\r\n([#11094](https://github.com/AztecProtocol/aztec-packages/issues/11094))\r\n([5de24e0](https://github.com/AztecProtocol/aztec-packages/commit/5de24e017afe9b5bd165a44caa7c96a6d5657589))\r\n* Log correlation in traces in google cloud\r\n([#11276](https://github.com/AztecProtocol/aztec-packages/issues/11276))\r\n([fbcc8ef](https://github.com/AztecProtocol/aztec-packages/commit/fbcc8efe139c9bbd20f347a244bdf960d03af73f)),\r\ncloses\r\n[#11019](https://github.com/AztecProtocol/aztec-packages/issues/11019)\r\n[#10937](https://github.com/AztecProtocol/aztec-packages/issues/10937)\r\n* Mark `noir-edwards` as expected to compile\r\n(https://github.com/noir-lang/noir/pull/7085)\r\n([a964cd0](https://github.com/AztecProtocol/aztec-packages/commit/a964cd075b97c45a526bfb81ba612b6eb077a29f))\r\n* Move shared pcs functionality to internal library in solidity and\r\nsmall refactorings in sumcheck\r\n([#11230](https://github.com/AztecProtocol/aztec-packages/issues/11230))\r\n([507ae9d](https://github.com/AztecProtocol/aztec-packages/commit/507ae9df9c369603da20f25ccc228729ee2733cd))\r\n* Reduce the number of provers in rc-1\r\n([#11296](https://github.com/AztecProtocol/aztec-packages/issues/11296))\r\n([92e40ff](https://github.com/AztecProtocol/aztec-packages/commit/92e40ff45d0511b61fa6e40af38f1382116ed937))\r\n* Remove references to padding txs\r\n([#11264](https://github.com/AztecProtocol/aztec-packages/issues/11264))\r\n([32408f6](https://github.com/AztecProtocol/aztec-packages/commit/32408f6f354bd0a9d2f03d418f971b2488815dcc))\r\n* Remove warnings from types and rollup lib crates\r\n([#11269](https://github.com/AztecProtocol/aztec-packages/issues/11269))\r\n([9f389a7](https://github.com/AztecProtocol/aztec-packages/commit/9f389a7bcb02e26b42faf3497c2f5782ec93be37))\r\n* Replace relative paths to noir-protocol-circuits\r\n([8ece166](https://github.com/AztecProtocol/aztec-packages/commit/8ece16686296c4c77143cfd4d0d176539051c4d8))\r\n* Replace relative paths to noir-protocol-circuits\r\n([be42305](https://github.com/AztecProtocol/aztec-packages/commit/be42305eb8ebcb1383219efd2e72725169bbb41f))\r\n* Retry deploys\r\n([#11252](https://github.com/AztecProtocol/aztec-packages/issues/11252))\r\n([23cfbb4](https://github.com/AztecProtocol/aztec-packages/commit/23cfbb410fddccae83031d39e867bc47241af2f5))\r\n* Set failed proof store for spartan deployments\r\n([#11282](https://github.com/AztecProtocol/aztec-packages/issues/11282))\r\n([f787a52](https://github.com/AztecProtocol/aztec-packages/commit/f787a5203ca05f1304f19c6c054ec58e85899b01))\r\n* Silence \"Updated proven chain\" log\r\n([#11250](https://github.com/AztecProtocol/aztec-packages/issues/11250))\r\n([44bd79b](https://github.com/AztecProtocol/aztec-packages/commit/44bd79b7e27d9610568f14c109b22cf7e36fe298))\r\n* Silence circuit return values in CI\r\n([#11259](https://github.com/AztecProtocol/aztec-packages/issues/11259))\r\n([db3d860](https://github.com/AztecProtocol/aztec-packages/commit/db3d860992eae972c8f7d1db2daf66673d83fb4b))\r\n* Stable masternet images\r\n([#11289](https://github.com/AztecProtocol/aztec-packages/issues/11289))\r\n([07fabe8](https://github.com/AztecProtocol/aztec-packages/commit/07fabe8d1760ce990c54bf3d95f34dec06e1c715))\r\n</details>\r\n\r\n<details><summary>barretenberg: 0.71.0</summary>\r\n\r\n##\r\n[0.71.0](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.70.0...barretenberg-v0.71.0)\r\n(2025-01-17)\r\n\r\n\r\n### Bug Fixes\r\n\r\n* Reallocate commitment key to avoid pippenger error\r\n([#11249](https://github.com/AztecProtocol/aztec-packages/issues/11249))\r\n([8fc2011](https://github.com/AztecProtocol/aztec-packages/commit/8fc2011fbe0e3545924898a53e851279b8cc0084))\r\n* Resolve misc bugs handling phases in avm witgen\r\n([#11218](https://github.com/AztecProtocol/aztec-packages/issues/11218))\r\n([29bc4bd](https://github.com/AztecProtocol/aztec-packages/commit/29bc4bdd5b59ee1050951e0c143654ef3cdd25b0))\r\n\r\n\r\n### Miscellaneous\r\n\r\n* **avm:** Calldata, returndata slices out of range padded with zeros\r\n([#11265](https://github.com/AztecProtocol/aztec-packages/issues/11265))\r\n([a469c94](https://github.com/AztecProtocol/aztec-packages/commit/a469c94ccfa37723aa79f132e55c31ae7c4c6693)),\r\ncloses\r\n[#10933](https://github.com/AztecProtocol/aztec-packages/issues/10933)\r\n* Move shared pcs functionality to internal library in solidity and\r\nsmall refactorings in sumcheck\r\n([#11230](https://github.com/AztecProtocol/aztec-packages/issues/11230))\r\n([507ae9d](https://github.com/AztecProtocol/aztec-packages/commit/507ae9df9c369603da20f25ccc228729ee2733cd))\r\n</details>\r\n\r\n---\r\nThis PR was generated with [Release\r\nPlease](https://github.com/googleapis/release-please). See\r\n[documentation](https://github.com/googleapis/release-please#release-please).",
          "timestamp": "2025-01-17T17:02:16Z",
          "tree_id": "1b5ba1a19bb8203f760731a37971768a334bfe91",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/232c34e849fa205a64123687f9fa4f70ce07292c"
        },
        "date": 1737134330877,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 19008.333519000018,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16150.737303 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21804.664949999988,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19425.967948 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4046.2032410000006,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3754.6085 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 75405.974647,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 75405974000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14564.283137,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14564284000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3111863966,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3111863966 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 134293097,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 134293097 ns\nthreads: 1"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "leizciw@gmail.com",
            "name": "Leila Wang",
            "username": "LeilaWang"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "5eb3e8f498093ae52b8a29939051cd8c66aed3c1",
          "message": "fix: verify start state of a block (#11290)\n\nCheck the start state of the first tx in a block, in block root rollup\r\ncircuit, to make sure that it matches the state in the previous block\r\nheader, whose hash is the last leaf in the last archive. Otherwise, it\r\ncould be whatever and that allows adding fake data by changing the tree\r\nroots in the start state.",
          "timestamp": "2025-01-17T17:44:00Z",
          "tree_id": "22f05b2c061d8b51ce04a470660b5e9d8afb80f8",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/5eb3e8f498093ae52b8a29939051cd8c66aed3c1"
        },
        "date": 1737137392031,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18988.931595,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16153.054796999999 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21459.59732199998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 18795.854 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4050.7235069999865,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3735.9792829999997 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 73381.475143,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 73381475000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14561.037115000003,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14561037000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3247769086,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3247769086 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 136750966,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 136750966 ns\nthreads: 1"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "49558828+AztecBot@users.noreply.github.com",
            "name": "Aztec Bot",
            "username": "AztecBot"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "77854e2c92ccf11dea3770845928ca5077a606d8",
          "message": "chore: redo typo PR by teenager-ETH (#11320)",
          "timestamp": "2025-01-17T19:20:01Z",
          "tree_id": "5891d81c0b23303a96a04d7b1c7c9b2e9e41801f",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/77854e2c92ccf11dea3770845928ca5077a606d8"
        },
        "date": 1737142625077,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 19324.58625199999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16499.317214000002 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21734.035049,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19379.37689 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4059.5569509999905,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3750.5608970000003 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 75344.501404,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 75344501000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14641.498220000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14641499000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3141947764,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3141947764 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 141464885,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 141464885 ns\nthreads: 1"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "gregojquiros@gmail.com",
            "name": "Gregorio Juliana",
            "username": "Thunkar"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "9e5ea3a6a45c1266504ec3c259b9c11aa4fd9f7a",
          "message": "chore: bump CRS and constants (#11306)\n\nTBD",
          "timestamp": "2025-01-18T06:40:42Z",
          "tree_id": "a910a914058738772ac53946602695f32f90a7fb",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/9e5ea3a6a45c1266504ec3c259b9c11aa4fd9f7a"
        },
        "date": 1737183416300,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 19005.296041999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16144.569088 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21661.184697999972,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19013.685954 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4069.253543000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3759.504492 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 75023.22103999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 75023222000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14605.393223000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14605394000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3104952680,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3104952680 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 135468036,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 135468036 ns\nthreads: 1"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "miranda@aztecprotocol.com",
            "name": "Miranda Wood",
            "username": "MirandaWood"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "f4725d2237c6e9c6b7b17248f8c33343cb9ea7f1",
          "message": "feat!: public logs (#11091)\n\n## Public Logs\r\n\r\n---\r\n\r\nUnencrypted logs -> public logs #9589\r\n\r\nLike `private_logs`, public logs are introduced in this PR and replace\r\nunencrypted logs. They:\r\n\r\n- Are no longer treated as bytes in ts/sol\r\n- Are no longer treated as log hashes in kernels/rollups\r\n- Are treated as arrays of fields (with contract address) everywhere\r\n\r\nAVM team: I've made some limited changes with help from Ilyas (tyvm)\r\njust so we have tests passing and logs being emitted, this is not\r\ncomplete! I've added #11124 to help track where changes need to be made\r\nin areas of the code I have no familiarity with. I didn't want to touch\r\ntoo many areas so I haven't fully renamed unencrypted -> public. Ofc I'm\r\nhappy to help anywhere that's needed.\r\n\r\nAztec-nr/Noir-contracts: This PR also addresses #9835. I don't know much\r\nabout how partial notes work or should work, so I tried to touch the\r\nleast I could to convert these logs to fields. One big change is that\r\nthe first field now contains the length of private fields and ciphertext\r\nbytes along with the public fields. This is because now we don't emit\r\nlogs as an array of bytes with a set length to ts, there isn't a way to\r\ntell when a log 'ends'. We also can't just discard zero values, because\r\nin many cases zeros are emitted as real log values.\r\n\r\n---\r\n\r\n~TODO:~ Completed\r\n\r\n- ~Some more renaming (e.g. `UnencryptedLogsResponse`, prefixes, public\r\ncontext, noir contracts)~\r\n- ~`MAX_UNENCRYPTED_LOGS_PER_CALL` -> `MAX_PUBLIC_LOGS_PER_CALL` (not\r\ndone yet, because `PublicCircuitPublicInputs` is linked to\r\n`AvmCircuitInputs` which goes into bb)~\r\n- ~Test and cleanup anything touching partial notes~\r\n\r\n---\r\n\r\nTODO in follow-up PRS:\r\n- Tightly pack individual logs when adding to blob: This is relatively\r\ncomplex because of the hacks we have in place (#10323) and the\r\nrequirement to overhaul blob field decoding, to avoid bloating this PR\r\nI'll make a new one.\r\n- Rename `emit_unencrypted`: This will touch a lot of files and just\r\nmake it difficult to review, so I'll add a follow up PR with just this\r\nrenaming.\r\n- Convert contract class logs to fields: Note that some classes like\r\n`UnencryptedL2Log` still exist. This is solely for contract class logs\r\nwhich have thousands of fields and so are still hashed to a single value\r\nin the kernels/rollups/ts. In a follow up PR I'll separately convert\r\nthese to fields to benchmark the effects.",
          "timestamp": "2025-01-20T17:08:27Z",
          "tree_id": "621fc5a782a806294a4112380fd273991a779590",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/f4725d2237c6e9c6b7b17248f8c33343cb9ea7f1"
        },
        "date": 1737393883402,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18870.99690400001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15899.221079 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21421.552335,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 18859.180383 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4052.0196079999664,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3720.9719689999997 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 73733.164267,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 73733165000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14507.938086999997,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14507938000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3557581850,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3557581850 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 146190272,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 146190272 ns\nthreads: 1"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "fcarreiro@users.noreply.github.com",
            "name": "Facundo",
            "username": "fcarreiro"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "4a9c0724e3dd6fa3ea8753fc17a090c33c307d01",
          "message": "feat(avm): bytecode manager changes (#11347)\n\n* We don't need the bytecode hash when simulating, since tracegen should\r\nrecompute it anyways. This should save ~25ms per bytecode.\r\n* Use `bytecode_id` instead of `class_id`.\r\n* Add bytecode retrieval events.",
          "timestamp": "2025-01-21T08:40:58Z",
          "tree_id": "441c65a1c28099f899f9df57a5f5c8fafb7fc4ee",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/4a9c0724e3dd6fa3ea8753fc17a090c33c307d01"
        },
        "date": 1737450397337,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 19318.682417999982,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16497.570429 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21894.544296999982,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19314.204303 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4135.295727999988,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3803.7697100000005 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 75709.889634,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 75709889000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14808.398434,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14808399000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3124544064,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3124544064 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 135510641,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 135510641 ns\nthreads: 1"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "fcarreiro@users.noreply.github.com",
            "name": "Facundo",
            "username": "fcarreiro"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "5f3cffc42bf2280367d44603ae6f509c46b6fede",
          "message": "feat(avm): address and class id derivation setup (#11354)\n\nBoilerplate/guardrails.",
          "timestamp": "2025-01-21T09:36:18Z",
          "tree_id": "40a5b407c1ded7127f187e050a9d66eb15caf33f",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/5f3cffc42bf2280367d44603ae6f509c46b6fede"
        },
        "date": 1737453129220,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 19121.895413999995,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16174.302158999999 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21722.390292,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19171.922021999995 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4086.064410000006,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3788.3919530000003 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 82166.71326399999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 82166713000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14718.344597999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14718345000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3080222129,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3080222129 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 133853433,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 133853433 ns\nthreads: 1"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "fcarreiro@users.noreply.github.com",
            "name": "Facundo",
            "username": "fcarreiro"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "4d149be20e73321fece072a1b7e410225b5dc8c9",
          "message": "feat(avm): include initial tree roots in DB (#11360)\n\nWe'll need the roots for the context and other stuff. I expect that `get_tree_roots()` will not lay constraints. I expect that the roots will be advanced via hints in, e.g, `emit_nullifier` (root before, root after).",
          "timestamp": "2025-01-21T10:37:49Z",
          "tree_id": "d61059801c174dd1b2c16c013c4b1bf6abe5f182",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/4d149be20e73321fece072a1b7e410225b5dc8c9"
        },
        "date": 1737456937849,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18934.115093000004,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16022.106673 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21571.164356000052,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 18870.275763999998 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4069.3137160000106,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3759.5047959999997 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 82807.149561,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 82807149000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14677.943532000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14677944000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 4028415386,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 4028415386 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 166153934,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 166153934 ns\nthreads: 1"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "fcarreiro@users.noreply.github.com",
            "name": "Facundo",
            "username": "fcarreiro"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "6b0106c1eedf098779e7903ac37e96e6b3a9d478",
          "message": "refactor(avm): remove some codegen bloat (#11418)\n\nTL;DR: Removes bloat, old and new witgen are still proving. Please review without nitpicking I recommend just merging if CI passes.\n\nMore detail:\n* Removes explicit column names, they now get generated via the macro.\n* Remove as_vector, replaced uses with get_column (and commented out some other uses).\n\nI also added, in vm2, nice per-namespace stats:\n\n```\nColumn sizes per namespace:\n  precomputed: 2097152 (~2^21)\n  execution: 6 (~2^3)\n  alu: 1 (~2^0)\n  lookup: 196608 (~2^18)\n  perm: 6 (~2^3)\n```\n\nIt autoupdates without us having to add columns manually.",
          "timestamp": "2025-01-22T12:06:39Z",
          "tree_id": "923f1f7a94635cf6bd1e230117036b680e50bed9",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/6b0106c1eedf098779e7903ac37e96e6b3a9d478"
        },
        "date": 1737549031955,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 19260.21167099998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16400.763047 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21595.914428999975,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19044.071107 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4065.5179260000123,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3732.402794 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 75921.92059600001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 75921921000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14679.953011,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14679954000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3123650853,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3123650853 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 133979790,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 133979790 ns\nthreads: 1"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "lucasxia01@gmail.com",
            "name": "Lucas Xia",
            "username": "lucasxia01"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "5a52e950428b511ea3024efb32c6d1c9b810fd89",
          "message": "chore: print warning in builder when failure happens. (#11205)\n\nPrints a warning when we call failure() in the builder and we are not in\r\nthe write_vk case. Also enables debug logging if NDEBUG is not set.",
          "timestamp": "2025-01-22T10:11:08-05:00",
          "tree_id": "1d6e111da28caac6c4c326522a38db6e3386809b",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/5a52e950428b511ea3024efb32c6d1c9b810fd89"
        },
        "date": 1737560182245,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 19102.130297999964,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16213.758748 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21588.159863999976,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19117.555076999997 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4067.51341399999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3761.366774 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 75210.918918,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 75210919000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14691.964098000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14691964000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3098157138,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3098157138 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 133538618,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 133538618 ns\nthreads: 1"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "98505400+ledwards2225@users.noreply.github.com",
            "name": "ledwards2225",
            "username": "ledwards2225"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "30a063a65f95403773d13da0d9a896da45d9608d",
          "message": "chore: minor Gemini refactor to prep for opening k-shifts (#11393)\n\nThe first in a series of Gemini updates that will facilitate the\naddition of k-shifts and hopefully improve the code along the way.\n\nEach method now has a single clear purpose and the storage of\npolynomials is general enough to accommodate opening a new set of\npolynomials. We make a distinction between the partially evaluated batch\npolynomials A₀₊(r), A₀₋(-r), and the d-1 \"fold\" polynomials Aₗ(−r^{2ˡ}),\nl = 1, ..., d-1. The former are constructed via\n`compute_partially_evaluated_batch_polynomials` and the latter through\n`compute_fold_polynomials`. Univariate opening claims for all d+1\npolynomials are constructed through\n`construct_univariate_opening_claims`. This makes each method clearer\nand avoids the need to store \"F\" and \"G\" in the first two slots of the\nold `fold_polynomials`, a trick which no longer works once we have a 3rd\npolynomial type, i.e. F, G and H.",
          "timestamp": "2025-01-22T08:14:15-07:00",
          "tree_id": "f58d37e59900136c1888981237ecc5b243c94d84",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/30a063a65f95403773d13da0d9a896da45d9608d"
        },
        "date": 1737560413143,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 19523.162044999994,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16868.68424 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21587.687391999963,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 18953.551667 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4520.827936999978,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4169.100918000001 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 72265.65905000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 72265659000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 13568.763116000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 13568764000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3284759030,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3284759030 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 150311423,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 150311423 ns\nthreads: 1"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "105737703+iakovenkos@users.noreply.github.com",
            "name": "sergei iakovenko",
            "username": "iakovenkos"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "fe34b0580a308665c655a897c72f06bd05dcd4c4",
          "message": "feat: eccvm sumcheck with commitments to round univariates (#11206)\n\n[Protocol outline](https://hackmd.io/sxlCHpVISdaaQJbCpcXA-Q)\r\n\r\n* combined with SmallSubgroup inner product argument, ensures that the\r\nsumcheck round univariates do not leak witness information (In ECCVM)\r\n* drastically reduces the eccvm proof size - instead of sending 24\r\ncoefficients of each round univariate, the prover sends evals at 0, 1,\r\nand a group element\r\n* reduces eccvm recursive verifier costs by avoiding expensive\r\nevaluations of polys of degree 23 (360K gates -> 230K gates)",
          "timestamp": "2025-01-22T16:32:11+01:00",
          "tree_id": "7cca89d27ac7e50ea84edf7fc6be7c76918360b3",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/fe34b0580a308665c655a897c72f06bd05dcd4c4"
        },
        "date": 1737561402901,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 19591.829495000013,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16680.902129 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 24930.087184,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19013.502672000002 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4438.269887000019,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4097.429571000001 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 80693.997431,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 80693998000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 13536.199834000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 13536201000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3549754629,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3549754629 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 153191669,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 153191669 ns\nthreads: 1"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "132435771+jeanmon@users.noreply.github.com",
            "name": "Jean M",
            "username": "jeanmon"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "64f4052d498496724ec56b207ca0f89c3fe87ac8",
          "message": "chore: more granular error handling for toradixBE (#11378)\n\nResolves #11295",
          "timestamp": "2025-01-22T16:47:37Z",
          "tree_id": "fc0050d4653c664d3e40d4e231f9ae73ada5e26e",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/64f4052d498496724ec56b207ca0f89c3fe87ac8"
        },
        "date": 1737565944210,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18879.12545200001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15916.126301999999 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21585.90592600001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 18777.12975 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4085.6791829999966,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3777.2066389999995 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 82896.60614100001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 82896606000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14718.318547,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14718319000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3090759059,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3090759059 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 135592313,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 135592313 ns\nthreads: 1"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "gregojquiros@gmail.com",
            "name": "Gregorio Juliana",
            "username": "Thunkar"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "01510f45aa5d385a08584df674d9caf9522e6be2",
          "message": "feat: Lazy wasm pt. 2 (#11410)\n\nFocusing on converting our account contract crypto fns",
          "timestamp": "2025-01-22T18:35:08+01:00",
          "tree_id": "aa4aacaf8c23a96ff8055785fc2d2a33f0ced25c",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/01510f45aa5d385a08584df674d9caf9522e6be2"
        },
        "date": 1737568844510,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 19227.91431599998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16391.361991 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21464.658516999974,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 18976.205669 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4046.244662000021,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3738.346501 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 77198.532948,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 77198534000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14593.498877000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14593499000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3210977855,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3210977855 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 132574195,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 132574195 ns\nthreads: 1"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "lucasxia01@gmail.com",
            "name": "Lucas Xia",
            "username": "lucasxia01"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "436c3c63b76e36d172619436b3237133f295aca7",
          "message": "fix: hackily fix the public input columns of avm recursion constraint (#11428)\n\nCurrently, this test triggers a builder failure. The hack sets some of\r\nthe public input columns of the recursive verifier to be all 0\r\nwitnesses. Add TODO for fixing it properly later.\r\n\r\nDiscovered when experimenting during\r\nhttps://github.com/AztecProtocol/aztec-packages/pull/11205.",
          "timestamp": "2025-01-22T13:57:36-05:00",
          "tree_id": "fd9e51b05b3e2b520226d7e78ee2b5c1a7f97edf",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/436c3c63b76e36d172619436b3237133f295aca7"
        },
        "date": 1737573796826,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 19695.662481,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16858.984866 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21452.209710999967,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 18648.052611 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4463.859380999992,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4119.559339000001 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 82485.749544,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 82485750000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 13509.475802,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 13509477000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3467897005,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3467897005 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 146839577,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 146839577 ns\nthreads: 1"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "fcarreiro@users.noreply.github.com",
            "name": "Facundo",
            "username": "fcarreiro"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "9796e1ea2720e6ee01be20b4c9226257c9efb0a9",
          "message": "chore(avm): do not use commit_sparse (#11447)\n\nExperiments in vm1 showed that we are at 90% median column fullness. I'm switching us to use the normal `commit` method which makes sense now that we are using tight polynomials (with virtual size). We could later use `commit` or `commit_sparse` depending on the runtime sparcity of a column (which we know), see: https://github.com/AztecProtocol/aztec-packages/blob/master/barretenberg/cpp/src/barretenberg/vm2/constraining/README.md\n\nFor now we use `commit` since the performance is almost the same for our current situation but the memory footprint is lower.",
          "timestamp": "2025-01-23T13:49:02Z",
          "tree_id": "5a7b3ad0ab57fa32f104ef19707ed4f1b55cb072",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/9796e1ea2720e6ee01be20b4c9226257c9efb0a9"
        },
        "date": 1737641595379,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 19049.998824999988,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16263.217849 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21561.917171999994,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19072.521275 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4084.894847999948,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3778.0737990000002 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 74471.137085,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 74471137000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14677.794882999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14677796000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3096265687,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3096265687 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 133923375,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 133923375 ns\nthreads: 1"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "codygunton@gmail.com",
            "name": "Cody Gunton",
            "username": "codygunton"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "c3c04a4cb92f0447431160d425bda66a997c0d66",
          "message": "feat: UH recursion in the browser (#11049)\n\nSets up yarn-project/noir-bb-bench for assessing the browser performance\r\nof UltraHonk. (Nb 920 lines in lockfile change)",
          "timestamp": "2025-01-23T16:30:22Z",
          "tree_id": "11a425352a624efe58d7a219e584aa754922145f",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/c3c04a4cb92f0447431160d425bda66a997c0d66"
        },
        "date": 1737650834541,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 19600.481195999975,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16754.845397 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21530.324070999995,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 18924.116271 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4455.77603000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4124.720758 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 72302.255947,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 72302256000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 13476.218786999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 13476220000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3138187568,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3138187568 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 143879624,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 143879624 ns\nthreads: 1"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "adam.domurad@gmail.com",
            "name": "ludamad",
            "username": "ludamad"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "bf3b12a374dddb8f7993e0c1537cfa6042f86f38",
          "message": "refactor(sol): generate & compile verifier contract in bootstrap (#11364)\n\nThis was an ad-hoc step in yarn-project, and write-contract was only\ncalled in the Earthfile's. This brings it to the bootstrap scripts where\nit can be a normal dependency of l1-contracts.",
          "timestamp": "2025-01-23T23:45:10+01:00",
          "tree_id": "65968ef72677cdc9ff674b251e2acf77560ed584",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/bf3b12a374dddb8f7993e0c1537cfa6042f86f38"
        },
        "date": 1737673317913,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 19104.28786700001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16316.943512999998 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21790.62566799996,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19238.588833 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4095.814961000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3798.9655679999996 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 75253.680304,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 75253681000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14745.195283000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14745197000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3260263498,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3260263498 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 139078838,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 139078838 ns\nthreads: 1"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "105737703+iakovenkos@users.noreply.github.com",
            "name": "sergei iakovenko",
            "username": "iakovenkos"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "5018c94db30ea80c93d194453d1c837a51fbe3a0",
          "message": "chore: fixed VK in MegaZK/ECCVM/Translator/Tube Recursive Verifier circuits (#11377)\n\n* Ensure that the verification keys for MegaZK-/ECCVM-/Translator\r\nRecursive Verifier circuits are fixed.\r\n* Ensure that the verification key for the Tube(=ClientIVC Recursive\r\nVerifier) circuit is fixed.\r\n\r\nWill close https://github.com/AztecProtocol/barretenberg/issues/1146",
          "timestamp": "2025-01-24T13:17:08Z",
          "tree_id": "82eec954946eb475787ebb88885dc59daf999811",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/5018c94db30ea80c93d194453d1c837a51fbe3a0"
        },
        "date": 1737726157056,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18791.377097999997,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16136.8084 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21403.117547000023,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 18821.465125 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4056.436815000012,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3757.1954899999996 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 85492.789257,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 85492789000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14653.711427999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14653712000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3875433356,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3875433356 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 161086378,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 161086378 ns\nthreads: 1"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "fcarreiro@users.noreply.github.com",
            "name": "Facundo",
            "username": "fcarreiro"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "53e57d3d52dd477714bc984c4a13bc8e5664877e",
          "message": "feat(avm): interactive debugger (#11477)\n\nDebugger plus some fixes. This has bb-pilcom changes so update and rebuild after it merges.\n\n<div>\n    <a href=\"https://www.loom.com/share/1ce400f55d4a4d888000cb54c7361a6f\">\n      <p>AVM interactive debugger - Watch Video</p>\n    </a>\n    <a href=\"https://www.loom.com/share/1ce400f55d4a4d888000cb54c7361a6f\">\n      <img style=\"max-width:300px;\" src=\"https://cdn.loom.com/sessions/thumbnails/1ce400f55d4a4d888000cb54c7361a6f-68caa0ac8f8e7ebb-full-play.gif\">\n    </a>\n  </div>\n\nNote: it does not support history or arrow keys or tab/autocompletion. Mostly because this is terminal-dependent and I don't want to pull in a console dependency. I might attempt to do it from scratch when I have some free time.",
          "timestamp": "2025-01-24T17:14:54Z",
          "tree_id": "33627ee29b10a2e1e250a78ff3814dd360a255aa",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/53e57d3d52dd477714bc984c4a13bc8e5664877e"
        },
        "date": 1737740470086,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 19551.898512999996,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16783.315028 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21711.950075999994,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 18795.998837 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4509.360458000003,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4103.1127750000005 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 80610.55416,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 80610555000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 13616.008651,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 13616009000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3114843972,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3114843972 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 142904597,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 142904597 ns\nthreads: 1"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "49558828+AztecBot@users.noreply.github.com",
            "name": "Aztec Bot",
            "username": "AztecBot"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "c0c4c1ff09de8d87113ca91b11c33cfeb4272cb4",
          "message": "chore(master): Release 0.72.0 (#11315)\n\n:robot: I have created a release *beep* *boop*\r\n---\r\n\r\n\r\n<details><summary>aztec-package: 0.72.0</summary>\r\n\r\n##\r\n[0.72.0](https://github.com/AztecProtocol/aztec-packages/compare/aztec-package-v0.71.0...aztec-package-v0.72.0)\r\n(2025-01-24)\r\n\r\n\r\n### Features\r\n\r\n* Gaztec\r\n([#11229](https://github.com/AztecProtocol/aztec-packages/issues/11229))\r\n([79f810d](https://github.com/AztecProtocol/aztec-packages/commit/79f810dc682d41154eb723e5bdf4c54c0681becb))\r\n* Lazy wasm pt. 2\r\n([#11410](https://github.com/AztecProtocol/aztec-packages/issues/11410))\r\n([01510f4](https://github.com/AztecProtocol/aztec-packages/commit/01510f45aa5d385a08584df674d9caf9522e6be2))\r\n* Lazy wasm pt3\r\n([#11435](https://github.com/AztecProtocol/aztec-packages/issues/11435))\r\n([7068d05](https://github.com/AztecProtocol/aztec-packages/commit/7068d055d91a6e81e6fbb670e17c77ee209a1a80))\r\n\r\n\r\n### Bug Fixes\r\n\r\n* Init fee juice contract in sandbox\r\n([#11379](https://github.com/AztecProtocol/aztec-packages/issues/11379))\r\n([caab526](https://github.com/AztecProtocol/aztec-packages/commit/caab52671cfcf20b395a9e44a8768dc81d986cb5))\r\n* Use simulation to estimate gas used\r\n([#11211](https://github.com/AztecProtocol/aztec-packages/issues/11211))\r\n([63776f0](https://github.com/AztecProtocol/aztec-packages/commit/63776f0d217fad800bf8a6c6144d6bb52844e629))\r\n\r\n\r\n### Miscellaneous\r\n\r\n* Trace propagation from json rpc client to server\r\n([#11325](https://github.com/AztecProtocol/aztec-packages/issues/11325))\r\n([85ccc15](https://github.com/AztecProtocol/aztec-packages/commit/85ccc1512cd9b1c461660ad8127dae848fde1878))\r\n</details>\r\n\r\n<details><summary>barretenberg.js: 0.72.0</summary>\r\n\r\n##\r\n[0.72.0](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg.js-v0.71.0...barretenberg.js-v0.72.0)\r\n(2025-01-24)\r\n\r\n\r\n### Features\r\n\r\n* Gaztec\r\n([#11229](https://github.com/AztecProtocol/aztec-packages/issues/11229))\r\n([79f810d](https://github.com/AztecProtocol/aztec-packages/commit/79f810dc682d41154eb723e5bdf4c54c0681becb))\r\n* Lazy wasm pt.1\r\n([#11371](https://github.com/AztecProtocol/aztec-packages/issues/11371))\r\n([864bc6f](https://github.com/AztecProtocol/aztec-packages/commit/864bc6f34431dee17e76c476716821996d2ff9e5))\r\n* Lazy wasm pt3\r\n([#11435](https://github.com/AztecProtocol/aztec-packages/issues/11435))\r\n([7068d05](https://github.com/AztecProtocol/aztec-packages/commit/7068d055d91a6e81e6fbb670e17c77ee209a1a80))\r\n* UH recursion in the browser\r\n([#11049](https://github.com/AztecProtocol/aztec-packages/issues/11049))\r\n([c3c04a4](https://github.com/AztecProtocol/aztec-packages/commit/c3c04a4cb92f0447431160d425bda66a997c0d66))\r\n\r\n\r\n### Bug Fixes\r\n\r\n* Lint\r\n([#11389](https://github.com/AztecProtocol/aztec-packages/issues/11389))\r\n([87b0dee](https://github.com/AztecProtocol/aztec-packages/commit/87b0deea9bb6291120cc5166359fc32efd1fbfce))\r\n</details>\r\n\r\n<details><summary>aztec-packages: 0.72.0</summary>\r\n\r\n##\r\n[0.72.0](https://github.com/AztecProtocol/aztec-packages/compare/aztec-packages-v0.71.0...aztec-packages-v0.72.0)\r\n(2025-01-24)\r\n\r\n\r\n### ⚠ BREAKING CHANGES\r\n\r\n* **aztec.js:** remove field from aztec address like\r\n([#11350](https://github.com/AztecProtocol/aztec-packages/issues/11350))\r\n* public logs\r\n([#11091](https://github.com/AztecProtocol/aztec-packages/issues/11091))\r\n\r\n### Features\r\n\r\n* **avm:** Address and class id derivation setup\r\n([#11354](https://github.com/AztecProtocol/aztec-packages/issues/11354))\r\n([5f3cffc](https://github.com/AztecProtocol/aztec-packages/commit/5f3cffc42bf2280367d44603ae6f509c46b6fede))\r\n* **avm:** Bytecode manager changes\r\n([#11347](https://github.com/AztecProtocol/aztec-packages/issues/11347))\r\n([4a9c072](https://github.com/AztecProtocol/aztec-packages/commit/4a9c0724e3dd6fa3ea8753fc17a090c33c307d01))\r\n* **avm:** Include initial tree roots in DB\r\n([#11360](https://github.com/AztecProtocol/aztec-packages/issues/11360))\r\n([4d149be](https://github.com/AztecProtocol/aztec-packages/commit/4d149be20e73321fece072a1b7e410225b5dc8c9))\r\n* **avm:** Interactive debugger\r\n([#11477](https://github.com/AztecProtocol/aztec-packages/issues/11477))\r\n([53e57d3](https://github.com/AztecProtocol/aztec-packages/commit/53e57d3d52dd477714bc984c4a13bc8e5664877e))\r\n* Consensus layer in spartan\r\n([#11105](https://github.com/AztecProtocol/aztec-packages/issues/11105))\r\n([55dd03c](https://github.com/AztecProtocol/aztec-packages/commit/55dd03c84c6ef7624ed3512b4d69b95c13b3af90))\r\n* Eccvm sumcheck with commitments to round univariates\r\n([#11206](https://github.com/AztecProtocol/aztec-packages/issues/11206))\r\n([fe34b05](https://github.com/AztecProtocol/aztec-packages/commit/fe34b0580a308665c655a897c72f06bd05dcd4c4))\r\n* Gaztec\r\n([#11229](https://github.com/AztecProtocol/aztec-packages/issues/11229))\r\n([79f810d](https://github.com/AztecProtocol/aztec-packages/commit/79f810dc682d41154eb723e5bdf4c54c0681becb))\r\n* Lazy wasm pt. 2\r\n([#11410](https://github.com/AztecProtocol/aztec-packages/issues/11410))\r\n([01510f4](https://github.com/AztecProtocol/aztec-packages/commit/01510f45aa5d385a08584df674d9caf9522e6be2))\r\n* Lazy wasm pt.1\r\n([#11371](https://github.com/AztecProtocol/aztec-packages/issues/11371))\r\n([864bc6f](https://github.com/AztecProtocol/aztec-packages/commit/864bc6f34431dee17e76c476716821996d2ff9e5))\r\n* Lazy wasm pt3\r\n([#11435](https://github.com/AztecProtocol/aztec-packages/issues/11435))\r\n([7068d05](https://github.com/AztecProtocol/aztec-packages/commit/7068d055d91a6e81e6fbb670e17c77ee209a1a80))\r\n* **p2p:** Batch request response\r\n([#11331](https://github.com/AztecProtocol/aztec-packages/issues/11331))\r\n([13b379d](https://github.com/AztecProtocol/aztec-packages/commit/13b379dac79ef59803d4d7d46bf8294879e66b0d))\r\n* **p2p:** Request response node sampling\r\n([#11330](https://github.com/AztecProtocol/aztec-packages/issues/11330))\r\n([6426d90](https://github.com/AztecProtocol/aztec-packages/commit/6426d9022d4870bc3576c11dd40fd609ebec81f1))\r\n* **p2p:** Send goodbye messages on disconnecting to peers\r\n([#10920](https://github.com/AztecProtocol/aztec-packages/issues/10920))\r\n([046968f](https://github.com/AztecProtocol/aztec-packages/commit/046968f39abdc577f3544f91d01e607a715b8c4b))\r\n* **p2p:** Validator use batch requests\r\n([#11332](https://github.com/AztecProtocol/aztec-packages/issues/11332))\r\n([29f7ce4](https://github.com/AztecProtocol/aztec-packages/commit/29f7ce4a7389eb5d07dd4fae76845ee6ae95d813))\r\n* Packable trait + using it for public storage\r\n([#11136](https://github.com/AztecProtocol/aztec-packages/issues/11136))\r\n([e74ce15](https://github.com/AztecProtocol/aztec-packages/commit/e74ce156662bf79e6a95348c882b4381aa931192))\r\n* Public logs\r\n([#11091](https://github.com/AztecProtocol/aztec-packages/issues/11091))\r\n([f4725d2](https://github.com/AztecProtocol/aztec-packages/commit/f4725d2237c6e9c6b7b17248f8c33343cb9ea7f1))\r\n* Re-exposing `compute_initialization_hash`\r\n([#11423](https://github.com/AztecProtocol/aztec-packages/issues/11423))\r\n([1ad2b70](https://github.com/AztecProtocol/aztec-packages/commit/1ad2b701464f78756ad1d78c6f770db96a307d85))\r\n* **reqresp:** Request l2 blocks\r\n([#11337](https://github.com/AztecProtocol/aztec-packages/issues/11337))\r\n([73a6698](https://github.com/AztecProtocol/aztec-packages/commit/73a6698bfa7400a94fe5d07e8f7508a5a73ed587))\r\n* **spartan:** Extra acounts with cl config\r\n([#11301](https://github.com/AztecProtocol/aztec-packages/issues/11301))\r\n([13fed74](https://github.com/AztecProtocol/aztec-packages/commit/13fed74badca1840ec56e0f2169632fa3a7ccf9e))\r\n* UH recursion in the browser\r\n([#11049](https://github.com/AztecProtocol/aztec-packages/issues/11049))\r\n([c3c04a4](https://github.com/AztecProtocol/aztec-packages/commit/c3c04a4cb92f0447431160d425bda66a997c0d66))\r\n\r\n\r\n### Bug Fixes\r\n\r\n* **aztec.js:** Remove field from aztec address like\r\n([#11350](https://github.com/AztecProtocol/aztec-packages/issues/11350))\r\n([26093f7](https://github.com/AztecProtocol/aztec-packages/commit/26093f78697d12c9af7e392f0c173a51b8268b40))\r\n* **bootstrap:** Include crates in noir projects hashes\r\n([#11344](https://github.com/AztecProtocol/aztec-packages/issues/11344))\r\n([1075113](https://github.com/AztecProtocol/aztec-packages/commit/10751139c2f761bfc04fa8cb2fda41b764119bc6))\r\n* **bootstrap:** Include crates in noir projects hashes take 2\r\n([#11351](https://github.com/AztecProtocol/aztec-packages/issues/11351))\r\n([1f36a04](https://github.com/AztecProtocol/aztec-packages/commit/1f36a043064024e84763ed7ca686cba0aeec74ae))\r\n* Clarify sepolia GA secrets\r\n([#11424](https://github.com/AztecProtocol/aztec-packages/issues/11424))\r\n([cf3c911](https://github.com/AztecProtocol/aztec-packages/commit/cf3c911addaa5447cc2ede874f27caf83f23ea93))\r\n* **docs:** Downgrade docusaurus to v 3.6\r\n([#11386](https://github.com/AztecProtocol/aztec-packages/issues/11386))\r\n([1e5d225](https://github.com/AztecProtocol/aztec-packages/commit/1e5d22583473a19c573dae1bf3577bdb8d1ec801))\r\n* Don't publish a block if we failed to create the block proposal\r\n([#11475](https://github.com/AztecProtocol/aztec-packages/issues/11475))\r\n([f589c90](https://github.com/AztecProtocol/aztec-packages/commit/f589c90bd48c8890dfdc38bbbb205d2e054654ae))\r\n* Flakey e2e_pruned_blocks test\r\n([#11431](https://github.com/AztecProtocol/aztec-packages/issues/11431))\r\n([887b8ff](https://github.com/AztecProtocol/aztec-packages/commit/887b8ffb316372d52995d5be64125bd76eb6ca2f))\r\n* Hackily fix the public input columns of avm recursion constraint\r\n([#11428](https://github.com/AztecProtocol/aztec-packages/issues/11428))\r\n([436c3c6](https://github.com/AztecProtocol/aztec-packages/commit/436c3c63b76e36d172619436b3237133f295aca7))\r\n* Hardcode value in constants\r\n([#11442](https://github.com/AztecProtocol/aztec-packages/issues/11442))\r\n([dd0684a](https://github.com/AztecProtocol/aztec-packages/commit/dd0684a7c3749f9c4c512dbf6ec49c81c92ed901))\r\n* Init fee juice contract in sandbox\r\n([#11379](https://github.com/AztecProtocol/aztec-packages/issues/11379))\r\n([caab526](https://github.com/AztecProtocol/aztec-packages/commit/caab52671cfcf20b395a9e44a8768dc81d986cb5))\r\n* Lint\r\n([#11389](https://github.com/AztecProtocol/aztec-packages/issues/11389))\r\n([87b0dee](https://github.com/AztecProtocol/aztec-packages/commit/87b0deea9bb6291120cc5166359fc32efd1fbfce))\r\n* Mnemonic needs quotes\r\n([#11429](https://github.com/AztecProtocol/aztec-packages/issues/11429))\r\n([de8dad4](https://github.com/AztecProtocol/aztec-packages/commit/de8dad4299ced197f3756d688a6b1fe864bad458))\r\n* Move eslint in circuits.js to dev deps\r\n([#11340](https://github.com/AztecProtocol/aztec-packages/issues/11340))\r\n([079a2c4](https://github.com/AztecProtocol/aztec-packages/commit/079a2c4a4d2d214b8ff85fb90482e336f2db154d))\r\n* Network deployments\r\n([#11463](https://github.com/AztecProtocol/aztec-packages/issues/11463))\r\n([0804913](https://github.com/AztecProtocol/aztec-packages/commit/080491323bf4d9b178d6fd5ab904c1ca03ec97da))\r\n* Pad base fee in aztec.js\r\n([#11370](https://github.com/AztecProtocol/aztec-packages/issues/11370))\r\n([d0e9a55](https://github.com/AztecProtocol/aztec-packages/commit/d0e9a5542ac6077732b9e1a04f1ef2681f5693d2))\r\n* Prevent PXE from making historical queries during note discovery\r\n([#11406](https://github.com/AztecProtocol/aztec-packages/issues/11406))\r\n([23000d4](https://github.com/AztecProtocol/aztec-packages/commit/23000d41cc2185e10414467be27c9556eec9942e))\r\n* Publish aztec packages\r\n([#11434](https://github.com/AztecProtocol/aztec-packages/issues/11434))\r\n([d9bfd51](https://github.com/AztecProtocol/aztec-packages/commit/d9bfd51a0d5e0a17476f99b244da6e9deb74f7da))\r\n* Re-stage the git hook formatted files - doh\r\n([#11430](https://github.com/AztecProtocol/aztec-packages/issues/11430))\r\n([02e6529](https://github.com/AztecProtocol/aztec-packages/commit/02e6529de10e1628d90e0e4908ee9bad6c2ba3d2))\r\n* **readme:** Remove stale link\r\n([#11333](https://github.com/AztecProtocol/aztec-packages/issues/11333))\r\n([bfcd8a5](https://github.com/AztecProtocol/aztec-packages/commit/bfcd8a52c537c0ec7fa3b18a87c8813a53856b76))\r\n* Spartan accounts\r\n([#11321](https://github.com/AztecProtocol/aztec-packages/issues/11321))\r\n([fa9c9ce](https://github.com/AztecProtocol/aztec-packages/commit/fa9c9ceed3bf2fd82bedc4850f068e4d67d214b2))\r\n* **spartan:** Beacon node networking policy\r\n([#11484](https://github.com/AztecProtocol/aztec-packages/issues/11484))\r\n([d5b9892](https://github.com/AztecProtocol/aztec-packages/commit/d5b9892adde4356a60cae4c93f49e3939d5feca4))\r\n* Stale selector comments\r\n([#11311](https://github.com/AztecProtocol/aztec-packages/issues/11311))\r\n([629bd64](https://github.com/AztecProtocol/aztec-packages/commit/629bd648851884d277da2971cf99f3b3aa7715ae))\r\n* Txe partial note support\r\n([#11414](https://github.com/AztecProtocol/aztec-packages/issues/11414))\r\n([cd9cad9](https://github.com/AztecProtocol/aztec-packages/commit/cd9cad91cc4924405c5ada533ec4d203104afbe6))\r\n* Update devbox\r\n([#11339](https://github.com/AztecProtocol/aztec-packages/issues/11339))\r\n([aca84ff](https://github.com/AztecProtocol/aztec-packages/commit/aca84fff818a0a67f4a3b88a35c3ef879e65a9c7))\r\n* Use simulation to estimate gas used\r\n([#11211](https://github.com/AztecProtocol/aztec-packages/issues/11211))\r\n([63776f0](https://github.com/AztecProtocol/aztec-packages/commit/63776f0d217fad800bf8a6c6144d6bb52844e629))\r\n* Verify start state of a block\r\n([#11290](https://github.com/AztecProtocol/aztec-packages/issues/11290))\r\n([5eb3e8f](https://github.com/AztecProtocol/aztec-packages/commit/5eb3e8f498093ae52b8a29939051cd8c66aed3c1))\r\n* Version undefined does not exist for tree NULLIFIER_TREE\r\n([#11421](https://github.com/AztecProtocol/aztec-packages/issues/11421))\r\n([b1cb502](https://github.com/AztecProtocol/aztec-packages/commit/b1cb502b235a5416d56434f43cc08ac439ff43b5))\r\n\r\n\r\n### Miscellaneous\r\n\r\n* Add a couple of comments in the AVM range check gadget\r\n([#11402](https://github.com/AztecProtocol/aztec-packages/issues/11402))\r\n([f1fd2d1](https://github.com/AztecProtocol/aztec-packages/commit/f1fd2d104d01a4582d8a48a6ab003d8791010967))\r\n* Add OTEL_EXCLUDE_METRICS\r\n([#11317](https://github.com/AztecProtocol/aztec-packages/issues/11317))\r\n([37d4fa8](https://github.com/AztecProtocol/aztec-packages/commit/37d4fa89c12ff120c03b5ddaac56ef38661231c7))\r\n* **avm:** Do not use commit_sparse\r\n([#11447](https://github.com/AztecProtocol/aztec-packages/issues/11447))\r\n([9796e1e](https://github.com/AztecProtocol/aztec-packages/commit/9796e1ea2720e6ee01be20b4c9226257c9efb0a9))\r\n* **avm:** Remove some codegen bloat\r\n([#11418](https://github.com/AztecProtocol/aztec-packages/issues/11418))\r\n([6b0106c](https://github.com/AztecProtocol/aztec-packages/commit/6b0106c1eedf098779e7903ac37e96e6b3a9d478))\r\n* **bootstrap:** Refine noir contracts rebuild pattern\r\n([#11367](https://github.com/AztecProtocol/aztec-packages/issues/11367))\r\n([90f5e8f](https://github.com/AztecProtocol/aztec-packages/commit/90f5e8f79ac3b64412eb79f53b294dfd56343421))\r\n* Bump CRS and constants\r\n([#11306](https://github.com/AztecProtocol/aztec-packages/issues/11306))\r\n([9e5ea3a](https://github.com/AztecProtocol/aztec-packages/commit/9e5ea3a6a45c1266504ec3c259b9c11aa4fd9f7a))\r\n* **ci:** Set correct image version in aztec image docker releases\r\n([#11334](https://github.com/AztecProtocol/aztec-packages/issues/11334))\r\n([197db95](https://github.com/AztecProtocol/aztec-packages/commit/197db951c1b5136eda187622e83300201665c11f))\r\n* Dont install and run metrics stack on kind network smoke\r\n([#11366](https://github.com/AztecProtocol/aztec-packages/issues/11366))\r\n([f66db63](https://github.com/AztecProtocol/aztec-packages/commit/f66db63b7033428f52dab8add62941348ca37890))\r\n* Exclude system metrics from k8s deployments\r\n([#11401](https://github.com/AztecProtocol/aztec-packages/issues/11401))\r\n([31be5fb](https://github.com/AztecProtocol/aztec-packages/commit/31be5fbc2b6a7663e65f3e8f1f2dc11930d60f13))\r\n* Exp 2 with 128 validators\r\n([#11483](https://github.com/AztecProtocol/aztec-packages/issues/11483))\r\n([206ca8d](https://github.com/AztecProtocol/aztec-packages/commit/206ca8d76852434af25ce9eb407a6178f8905df6))\r\n* Fix devnet deploy\r\n([#11387](https://github.com/AztecProtocol/aztec-packages/issues/11387))\r\n([71d8ede](https://github.com/AztecProtocol/aztec-packages/commit/71d8ede826ef5a0d4a49aee743904f929cfec651))\r\n* Fixed VK in MegaZK/ECCVM/Translator/Tube Recursive Verifier circuits\r\n([#11377](https://github.com/AztecProtocol/aztec-packages/issues/11377))\r\n([5018c94](https://github.com/AztecProtocol/aztec-packages/commit/5018c94db30ea80c93d194453d1c837a51fbe3a0))\r\n* Improving clarity of serialization in macros\r\n([#11460](https://github.com/AztecProtocol/aztec-packages/issues/11460))\r\n([7790973](https://github.com/AztecProtocol/aztec-packages/commit/77909739c06b7fdf5bedb4ded70b684273f1d647))\r\n* Increase initial fee juice mint\r\n([#11369](https://github.com/AztecProtocol/aztec-packages/issues/11369))\r\n([bca7052](https://github.com/AztecProtocol/aztec-packages/commit/bca70529f39bb3d8e579d82d62d5c8464711ae45))\r\n* Minor Gemini refactor to prep for opening k-shifts\r\n([#11393](https://github.com/AztecProtocol/aztec-packages/issues/11393))\r\n([30a063a](https://github.com/AztecProtocol/aztec-packages/commit/30a063a65f95403773d13da0d9a896da45d9608d))\r\n* More granular error handling for toradixBE\r\n([#11378](https://github.com/AztecProtocol/aztec-packages/issues/11378))\r\n([64f4052](https://github.com/AztecProtocol/aztec-packages/commit/64f4052d498496724ec56b207ca0f89c3fe87ac8)),\r\ncloses\r\n[#11295](https://github.com/AztecProtocol/aztec-packages/issues/11295)\r\n* Nargo fmt pre-commit hook\r\n([#11416](https://github.com/AztecProtocol/aztec-packages/issues/11416))\r\n([6f2e2e0](https://github.com/AztecProtocol/aztec-packages/commit/6f2e2e0d37a870767790cdd6daa31c18b2af25ef))\r\n* Nuking redundant oracle\r\n([#11368](https://github.com/AztecProtocol/aztec-packages/issues/11368))\r\n([b32d9a1](https://github.com/AztecProtocol/aztec-packages/commit/b32d9a114de7f4ae576febdbbf10a2ef89960bf1))\r\n* **p2p:** Disable flakey test\r\n([#11380](https://github.com/AztecProtocol/aztec-packages/issues/11380))\r\n([94012b5](https://github.com/AztecProtocol/aztec-packages/commit/94012b585cf606ba78b50a494be9fee16024d5ec))\r\n* **p2p:** Reorganise reqresp handlers\r\n([#11327](https://github.com/AztecProtocol/aztec-packages/issues/11327))\r\n([f048acd](https://github.com/AztecProtocol/aztec-packages/commit/f048acd9e80f93c037867c941bef6aed413f3d87))\r\n* Point to monorepo's nargo in vscode workspace settings\r\n([#11349](https://github.com/AztecProtocol/aztec-packages/issues/11349))\r\n([bb96e7c](https://github.com/AztecProtocol/aztec-packages/commit/bb96e7ccddb5ed0068ab8f857658b212e8794e29))\r\n* Print warning in builder when failure happens.\r\n([#11205](https://github.com/AztecProtocol/aztec-packages/issues/11205))\r\n([5a52e95](https://github.com/AztecProtocol/aztec-packages/commit/5a52e950428b511ea3024efb32c6d1c9b810fd89))\r\n* Public network with sepolia\r\n([#11488](https://github.com/AztecProtocol/aztec-packages/issues/11488))\r\n([80f5a46](https://github.com/AztecProtocol/aztec-packages/commit/80f5a46bb159f531ecb742b4cb566f93b362f2dc))\r\n* Rc-2 release on Sepolia\r\n([#11479](https://github.com/AztecProtocol/aztec-packages/issues/11479))\r\n([bef7b0f](https://github.com/AztecProtocol/aztec-packages/commit/bef7b0f257f1a7bc738835962e21f6f338b263ca))\r\n* Redo typo PR by Daulox92\r\n([#11458](https://github.com/AztecProtocol/aztec-packages/issues/11458))\r\n([f3ba327](https://github.com/AztecProtocol/aztec-packages/commit/f3ba32709a9776d6b737e976fb652ae466ca916e))\r\n* Redo typo PR by Dimitrolito\r\n([#11413](https://github.com/AztecProtocol/aztec-packages/issues/11413))\r\n([d4b7075](https://github.com/AztecProtocol/aztec-packages/commit/d4b707533ab29accafbe42fab8e8d3f429b6979c))\r\n* Redo typo PR by nnsW3\r\n([#11322](https://github.com/AztecProtocol/aztec-packages/issues/11322))\r\n([de64823](https://github.com/AztecProtocol/aztec-packages/commit/de648233385062ab526ccf9206c7c4060444c2ab))\r\n* Redo typo PR by offensif\r\n([#11411](https://github.com/AztecProtocol/aztec-packages/issues/11411))\r\n([a756578](https://github.com/AztecProtocol/aztec-packages/commit/a75657890add2deaa2d1b2dae89d406939a6a674))\r\n* Redo typo PR by savvar9991\r\n([#11412](https://github.com/AztecProtocol/aztec-packages/issues/11412))\r\n([53ea3af](https://github.com/AztecProtocol/aztec-packages/commit/53ea3af49bf37b4bf29e4c0b517eb2a7e1e7d718))\r\n* Redo typo PR by teenager-ETH\r\n([#11320](https://github.com/AztecProtocol/aztec-packages/issues/11320))\r\n([77854e2](https://github.com/AztecProtocol/aztec-packages/commit/77854e2c92ccf11dea3770845928ca5077a606d8))\r\n* Redo typo PR by teenager-ETH\r\n([#11450](https://github.com/AztecProtocol/aztec-packages/issues/11450))\r\n([dd46152](https://github.com/AztecProtocol/aztec-packages/commit/dd4615265b6b83ff928128de9f2a6ed1d39bfda9))\r\n* Reenable reqresp offline peers test\r\n([#11384](https://github.com/AztecProtocol/aztec-packages/issues/11384))\r\n([931dfa6](https://github.com/AztecProtocol/aztec-packages/commit/931dfa67bdf074d3b276712b44c3783cf19e3324))\r\n* Renaming emit unencrypted -&gt; emit public\r\n([#11361](https://github.com/AztecProtocol/aztec-packages/issues/11361))\r\n([c047a12](https://github.com/AztecProtocol/aztec-packages/commit/c047a12e7cf41b34a80251278edef40300cd39ef))\r\n* Replace relative paths to noir-protocol-circuits\r\n([6f644cd](https://github.com/AztecProtocol/aztec-packages/commit/6f644cdea65657e0d3bab20c13687bcca542a122))\r\n* Replace relative paths to noir-protocol-circuits\r\n([fe24778](https://github.com/AztecProtocol/aztec-packages/commit/fe24778b7c9dec289f10068b57bc0b7007e5c7c4))\r\n* Replace relative paths to noir-protocol-circuits\r\n([fcdb409](https://github.com/AztecProtocol/aztec-packages/commit/fcdb4094495757dfa477bc8d24fc60b662cccde7))\r\n* Replace relative paths to noir-protocol-circuits\r\n([ea43aed](https://github.com/AztecProtocol/aztec-packages/commit/ea43aed9c9e798766c7813a10de06566dce0a98a))\r\n* Replace relative paths to noir-protocol-circuits\r\n([7653c69](https://github.com/AztecProtocol/aztec-packages/commit/7653c69bcc7dd58bb80ed2d2a940766c29c4a83e))\r\n* Replace relative paths to noir-protocol-circuits\r\n([204476e](https://github.com/AztecProtocol/aztec-packages/commit/204476e804de4d52c5170143fa3a5ee47d0a0fea))\r\n* Serialize trait impls for U128 following intrinsic Noir serialization\r\n([#11142](https://github.com/AztecProtocol/aztec-packages/issues/11142))\r\n([c5671d2](https://github.com/AztecProtocol/aztec-packages/commit/c5671d2aae8fa1306545541039e769de6dc44a8f))\r\n* Slower exp2\r\n([#11487](https://github.com/AztecProtocol/aztec-packages/issues/11487))\r\n([e995c0f](https://github.com/AztecProtocol/aztec-packages/commit/e995c0f955b708d48d85e3321b96269ffdf1afe5))\r\n* **sol:** Generate & compile verifier contract in bootstrap\r\n([#11364](https://github.com/AztecProtocol/aztec-packages/issues/11364))\r\n([bf3b12a](https://github.com/AztecProtocol/aztec-packages/commit/bf3b12a374dddb8f7993e0c1537cfa6042f86f38))\r\n* **spartan:** Apply release fixes post cl\r\n([#11385](https://github.com/AztecProtocol/aztec-packages/issues/11385))\r\n([2bbf562](https://github.com/AztecProtocol/aztec-packages/commit/2bbf5624b24064a74c2d291b0e78cecd858c2367))\r\n* Stricter contributing rules\r\n([#11462](https://github.com/AztecProtocol/aztec-packages/issues/11462))\r\n([2535425](https://github.com/AztecProtocol/aztec-packages/commit/2535425b54751780c65b28c83e630cb5bd7c8a5f))\r\n* Temporarily disable boxes\r\n([#11472](https://github.com/AztecProtocol/aztec-packages/issues/11472))\r\n([f6c63fe](https://github.com/AztecProtocol/aztec-packages/commit/f6c63fef7fc5fabc03c851521ea8d439dc836e0a))\r\n* Test starting multiple anvils allocates distinct ports\r\n([#11314](https://github.com/AztecProtocol/aztec-packages/issues/11314))\r\n([e385ea9](https://github.com/AztecProtocol/aztec-packages/commit/e385ea9f3e34f8254aed6b8b15c8c6e3179427dc))\r\n* Trace propagation from json rpc client to server\r\n([#11325](https://github.com/AztecProtocol/aztec-packages/issues/11325))\r\n([85ccc15](https://github.com/AztecProtocol/aztec-packages/commit/85ccc1512cd9b1c461660ad8127dae848fde1878))\r\n* Try fix e2e block building flake\r\n([#11359](https://github.com/AztecProtocol/aztec-packages/issues/11359))\r\n([38fbd5c](https://github.com/AztecProtocol/aztec-packages/commit/38fbd5cf56776b879bcad7b6643127361718f225))\r\n* Try fix flakey public processor test\r\n([#11348](https://github.com/AztecProtocol/aztec-packages/issues/11348))\r\n([8de55d4](https://github.com/AztecProtocol/aztec-packages/commit/8de55d4095642ae203fce766270981326c14ec35))\r\n* Updated ethereum resource config\r\n([#11485](https://github.com/AztecProtocol/aztec-packages/issues/11485))\r\n([8788561](https://github.com/AztecProtocol/aztec-packages/commit/8788561521090810b641b82b0c06131c063f7221))\r\n</details>\r\n\r\n<details><summary>barretenberg: 0.72.0</summary>\r\n\r\n##\r\n[0.72.0](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.71.0...barretenberg-v0.72.0)\r\n(2025-01-24)\r\n\r\n\r\n### ⚠ BREAKING CHANGES\r\n\r\n* public logs\r\n([#11091](https://github.com/AztecProtocol/aztec-packages/issues/11091))\r\n\r\n### Features\r\n\r\n* **avm:** Address and class id derivation setup\r\n([#11354](https://github.com/AztecProtocol/aztec-packages/issues/11354))\r\n([5f3cffc](https://github.com/AztecProtocol/aztec-packages/commit/5f3cffc42bf2280367d44603ae6f509c46b6fede))\r\n* **avm:** Bytecode manager changes\r\n([#11347](https://github.com/AztecProtocol/aztec-packages/issues/11347))\r\n([4a9c072](https://github.com/AztecProtocol/aztec-packages/commit/4a9c0724e3dd6fa3ea8753fc17a090c33c307d01))\r\n* **avm:** Include initial tree roots in DB\r\n([#11360](https://github.com/AztecProtocol/aztec-packages/issues/11360))\r\n([4d149be](https://github.com/AztecProtocol/aztec-packages/commit/4d149be20e73321fece072a1b7e410225b5dc8c9))\r\n* **avm:** Interactive debugger\r\n([#11477](https://github.com/AztecProtocol/aztec-packages/issues/11477))\r\n([53e57d3](https://github.com/AztecProtocol/aztec-packages/commit/53e57d3d52dd477714bc984c4a13bc8e5664877e))\r\n* Eccvm sumcheck with commitments to round univariates\r\n([#11206](https://github.com/AztecProtocol/aztec-packages/issues/11206))\r\n([fe34b05](https://github.com/AztecProtocol/aztec-packages/commit/fe34b0580a308665c655a897c72f06bd05dcd4c4))\r\n* Lazy wasm pt. 2\r\n([#11410](https://github.com/AztecProtocol/aztec-packages/issues/11410))\r\n([01510f4](https://github.com/AztecProtocol/aztec-packages/commit/01510f45aa5d385a08584df674d9caf9522e6be2))\r\n* Public logs\r\n([#11091](https://github.com/AztecProtocol/aztec-packages/issues/11091))\r\n([f4725d2](https://github.com/AztecProtocol/aztec-packages/commit/f4725d2237c6e9c6b7b17248f8c33343cb9ea7f1))\r\n* UH recursion in the browser\r\n([#11049](https://github.com/AztecProtocol/aztec-packages/issues/11049))\r\n([c3c04a4](https://github.com/AztecProtocol/aztec-packages/commit/c3c04a4cb92f0447431160d425bda66a997c0d66))\r\n\r\n\r\n### Bug Fixes\r\n\r\n* Hackily fix the public input columns of avm recursion constraint\r\n([#11428](https://github.com/AztecProtocol/aztec-packages/issues/11428))\r\n([436c3c6](https://github.com/AztecProtocol/aztec-packages/commit/436c3c63b76e36d172619436b3237133f295aca7))\r\n* Verify start state of a block\r\n([#11290](https://github.com/AztecProtocol/aztec-packages/issues/11290))\r\n([5eb3e8f](https://github.com/AztecProtocol/aztec-packages/commit/5eb3e8f498093ae52b8a29939051cd8c66aed3c1))\r\n\r\n\r\n### Miscellaneous\r\n\r\n* Add a couple of comments in the AVM range check gadget\r\n([#11402](https://github.com/AztecProtocol/aztec-packages/issues/11402))\r\n([f1fd2d1](https://github.com/AztecProtocol/aztec-packages/commit/f1fd2d104d01a4582d8a48a6ab003d8791010967))\r\n* **avm:** Do not use commit_sparse\r\n([#11447](https://github.com/AztecProtocol/aztec-packages/issues/11447))\r\n([9796e1e](https://github.com/AztecProtocol/aztec-packages/commit/9796e1ea2720e6ee01be20b4c9226257c9efb0a9))\r\n* **avm:** Remove some codegen bloat\r\n([#11418](https://github.com/AztecProtocol/aztec-packages/issues/11418))\r\n([6b0106c](https://github.com/AztecProtocol/aztec-packages/commit/6b0106c1eedf098779e7903ac37e96e6b3a9d478))\r\n* Bump CRS and constants\r\n([#11306](https://github.com/AztecProtocol/aztec-packages/issues/11306))\r\n([9e5ea3a](https://github.com/AztecProtocol/aztec-packages/commit/9e5ea3a6a45c1266504ec3c259b9c11aa4fd9f7a))\r\n* Fixed VK in MegaZK/ECCVM/Translator/Tube Recursive Verifier circuits\r\n([#11377](https://github.com/AztecProtocol/aztec-packages/issues/11377))\r\n([5018c94](https://github.com/AztecProtocol/aztec-packages/commit/5018c94db30ea80c93d194453d1c837a51fbe3a0))\r\n* Minor Gemini refactor to prep for opening k-shifts\r\n([#11393](https://github.com/AztecProtocol/aztec-packages/issues/11393))\r\n([30a063a](https://github.com/AztecProtocol/aztec-packages/commit/30a063a65f95403773d13da0d9a896da45d9608d))\r\n* More granular error handling for toradixBE\r\n([#11378](https://github.com/AztecProtocol/aztec-packages/issues/11378))\r\n([64f4052](https://github.com/AztecProtocol/aztec-packages/commit/64f4052d498496724ec56b207ca0f89c3fe87ac8)),\r\ncloses\r\n[#11295](https://github.com/AztecProtocol/aztec-packages/issues/11295)\r\n* Print warning in builder when failure happens.\r\n([#11205](https://github.com/AztecProtocol/aztec-packages/issues/11205))\r\n([5a52e95](https://github.com/AztecProtocol/aztec-packages/commit/5a52e950428b511ea3024efb32c6d1c9b810fd89))\r\n* Redo typo PR by Daulox92\r\n([#11458](https://github.com/AztecProtocol/aztec-packages/issues/11458))\r\n([f3ba327](https://github.com/AztecProtocol/aztec-packages/commit/f3ba32709a9776d6b737e976fb652ae466ca916e))\r\n* Redo typo PR by teenager-ETH\r\n([#11320](https://github.com/AztecProtocol/aztec-packages/issues/11320))\r\n([77854e2](https://github.com/AztecProtocol/aztec-packages/commit/77854e2c92ccf11dea3770845928ca5077a606d8))\r\n* **sol:** Generate & compile verifier contract in bootstrap\r\n([#11364](https://github.com/AztecProtocol/aztec-packages/issues/11364))\r\n([bf3b12a](https://github.com/AztecProtocol/aztec-packages/commit/bf3b12a374dddb8f7993e0c1537cfa6042f86f38))\r\n</details>\r\n\r\n---\r\nThis PR was generated with [Release\r\nPlease](https://github.com/googleapis/release-please). See\r\n[documentation](https://github.com/googleapis/release-please#release-please).",
          "timestamp": "2025-01-24T13:48:31-05:00",
          "tree_id": "c75e6222cf7a757971877045df141363185394fc",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/c0c4c1ff09de8d87113ca91b11c33cfeb4272cb4"
        },
        "date": 1737745505272,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 19598.859076000026,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16756.621317 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21601.363438000022,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 18678.725643 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4466.896229000014,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4099.1641359999985 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 72326.362657,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 72326363000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 13572.857530000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 13572859000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3091839007,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3091839007 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 141670320,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 141670320 ns\nthreads: 1"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "name": "AztecProtocol",
            "username": "AztecProtocol"
          },
          "committer": {
            "name": "AztecProtocol",
            "username": "AztecProtocol"
          },
          "id": "c256d5fef823f69ba940170235c1aae5bf2dfcba",
          "message": "chore(master): Release 0.72.1",
          "timestamp": "2025-01-24T20:04:59Z",
          "url": "https://github.com/AztecProtocol/aztec-packages/pull/11494/commits/c256d5fef823f69ba940170235c1aae5bf2dfcba"
        },
        "date": 1737749872311,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 19661.172900000027,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16894.706684999997 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21631.62241399999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19047.579304 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4458.072764000008,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4027.8960589999997 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 80050.650053,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 80050650000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 13533.893152000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 13533893000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3097835625,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3097835625 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 141003845,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 141003845 ns\nthreads: 1"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "49558828+AztecBot@users.noreply.github.com",
            "name": "Aztec Bot",
            "username": "AztecBot"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "6f8912e0274b4a4c6757efd5f2d08568e5b717c6",
          "message": "chore(master): Release 0.72.1 (#11494)\n\n:robot: I have created a release *beep* *boop*\r\n---\r\n\r\n\r\n<details><summary>aztec-package: 0.72.1</summary>\r\n\r\n##\r\n[0.72.1](https://github.com/AztecProtocol/aztec-packages/compare/aztec-package-v0.72.0...aztec-package-v0.72.1)\r\n(2025-01-24)\r\n\r\n\r\n### Miscellaneous\r\n\r\n* **aztec-package:** Synchronize aztec-packages versions\r\n</details>\r\n\r\n<details><summary>barretenberg.js: 0.72.1</summary>\r\n\r\n##\r\n[0.72.1](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg.js-v0.72.0...barretenberg.js-v0.72.1)\r\n(2025-01-24)\r\n\r\n\r\n### Miscellaneous\r\n\r\n* **barretenberg.js:** Synchronize aztec-packages versions\r\n</details>\r\n\r\n<details><summary>aztec-packages: 0.72.1</summary>\r\n\r\n##\r\n[0.72.1](https://github.com/AztecProtocol/aztec-packages/compare/aztec-packages-v0.72.0...aztec-packages-v0.72.1)\r\n(2025-01-24)\r\n\r\n\r\n### Bug Fixes\r\n\r\n* Fix docs deployment\r\n([#11492](https://github.com/AztecProtocol/aztec-packages/issues/11492))\r\n([644570b](https://github.com/AztecProtocol/aztec-packages/commit/644570ba8fcba98f665129c944fbf0c235efc486))\r\n* Npm version unbound variable\r\n([#11495](https://github.com/AztecProtocol/aztec-packages/issues/11495))\r\n([868600b](https://github.com/AztecProtocol/aztec-packages/commit/868600b3dcbca50b27b2056c21a2af18376990d0))\r\n</details>\r\n\r\n<details><summary>barretenberg: 0.72.1</summary>\r\n\r\n##\r\n[0.72.1](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.72.0...barretenberg-v0.72.1)\r\n(2025-01-24)\r\n\r\n\r\n### Miscellaneous\r\n\r\n* **barretenberg:** Synchronize aztec-packages versions\r\n</details>\r\n\r\n---\r\nThis PR was generated with [Release\r\nPlease](https://github.com/googleapis/release-please). See\r\n[documentation](https://github.com/googleapis/release-please#release-please).",
          "timestamp": "2025-01-24T15:04:54-05:00",
          "tree_id": "63ef12a65c635a52653dd7a2f22c19c44131dd7c",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/6f8912e0274b4a4c6757efd5f2d08568e5b717c6"
        },
        "date": 1737750098550,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 19765.342367000016,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16903.961156 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21618.499794000003,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 18933.075301 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4456.699274999977,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4126.811813 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 81677.829618,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 81677830000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 13510.411223999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 13510411000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3707088035,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3707088035 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 181293496,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 181293496 ns\nthreads: 1"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "47112877+dbanks12@users.noreply.github.com",
            "name": "David Banks",
            "username": "dbanks12"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "79cbe04cfdccdc0926084d837d3ae989f70d441c",
          "message": "feat(avm): range checks in vm2 (#11433)\n\nAlso `sel_range_8/16` and `power_of_2` precomputed tables",
          "timestamp": "2025-01-24T20:36:20Z",
          "tree_id": "bf1b6ef3e2a42b7c3a1581b87a6e5cfcd75a426a",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/79cbe04cfdccdc0926084d837d3ae989f70d441c"
        },
        "date": 1737752514329,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 19612.127059999977,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16840.31141 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21598.104406000006,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 18911.804642 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4464.20108000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4088.8942469999997 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 81419.30016700001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 81419300000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 13554.093519000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 13554094000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3767902525,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3767902525 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 167065101,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 167065101 ns\nthreads: 1"
          }
        ]
      }
    ]
  }
}