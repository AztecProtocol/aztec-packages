#!/usr/bin/python3

import numpy as np
import argparse
from io import StringIO

def evaluate_benchmark_from_file(filename):
    lines=[]
    header_found=False
    x_exponents=[]
    # Google benchmarks have a few extra lines at the start, so we need to skip them
    with open (filename) as f:
        for line in f:
            if line.find("name,iterations,real_time,cpu_time,time_unit,bytes_per_second,items_per_second,label,error_occurred,error_message")!=-1:
                header_found=True
                lines.append(line)
                continue
            if header_found:
                lines.append(line)
                x_exponents.append(int(line.replace('"','').split(',')[0].split('/')[1]))
    
    data=np.genfromtxt(StringIO('\n'.join(lines)),delimiter=",",usemask=True)
    y=np.transpose(data[1:])[2]
    x=np.array([1<<i for i in x_exponents])
    A=np.vstack([x,np.ones(len(x))]).T
    m, c = np.linalg.lstsq(A, y, rcond=None)[0]
    return m

if __name__=="__main__":
    parser=argparse.ArgumentParser(description='Read google-benchmarks generated benchmarks and calculate single operation cost',epilog='This expects a single file with a single type of benchmark <name>/i')
    parser.add_argument("-f","--file",dest="filename",required=True,help="read benchmark information from FILE", metavar="FILE")
    args=parser.parse_args()
    filename=args.filename
    if filename==None:
        parser.print_help()
        exit()
    print (evaluate_benchmark_from_file(filename), 'microseconds')