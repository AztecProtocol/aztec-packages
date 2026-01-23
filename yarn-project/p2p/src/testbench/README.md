## P2P Test bench

A testbench that runs only the P2P client on a number of worker threads, with the purpose of monitoring and testing the performance of the P2P client.

### Running the testbench

```bash
./run_testbench.sh <outputfile>
```

This will produce a LONG series of logs that can be used for further analysis.

## TODO

- Strongly parameterizing the testbench scripts
- Add traffic shaping options to the testbench
- Add log parsing step that can categorize a report in json of the propoagation of the message
- Add multiple different tx sizes
- Create ci pipeline that can run analysis on the logs and compare against previous runs
- Create a series of markdown reports detailing what each parameter change does and include graphs to compare performance
