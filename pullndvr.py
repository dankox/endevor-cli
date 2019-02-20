#!/usr/bin/env python
import sys
import socket
import json
import time
from functools import partial
from subprocess import call
from multiprocessing.dummy import Pool as ThreadPool


#call(["ls"])

startT = time.time()

extToType = { "ASMPGM": "asm", "ASMMAC": "mac", "CPGM": "cpp", "CHDR": "h" }

listElm = list()
commands = list()

for line in sys.stdin:
    print(line)
    listElm.append(line)

# listElm.append('{"fullElmName":"DXENCIPH","typeName":"ASMPGM","sbsName":"DXKL"}')
# listElm.append('{"fullElmName":"BC1PSERV","typeName":"ASMPGM","sbsName":"DXKL"}')

for elm in listElm:
    #print(elm)
    jdata=json.loads(elm)
    filename = jdata["fullElmName"] + "." + jdata["typeName"]  # extToType[jdata["typeName"]] exception if not exists in list
    command = "bash -c 'endevor view element \"" + jdata["fullElmName"] + "\" -i CMEWXY01 --env " + jdata["envName"] + " --sn " + jdata["stgNum"] + \
    " --sys " + jdata["sysName"] + " --sub " + jdata["sbsName"] + " --type " + jdata["typeName"] + " --tf \"" + filename + "\"'"
    commands.append(command)

#print(commands)

# commands = [
#     'bash -c "date ; ls -l; sleep 1; date"',
#     'bash -c "date ; sleep 5; date"',
#     'bash -c "date ; df -h; sleep 3; date"',
#     'bash -c "date ; hostname; sleep 2; date"',
#     'bash -c "date ; uname -a; date"',
# ]

# make the Pool of workers
pool = ThreadPool(16)

# open the urls in their own threads
# and return the results
results = pool.map(partial(call, shell=True), commands)

# close the pool and wait for the work to finish
pool.close()
pool.join()

endT = time.time()

print("Elapsed time: ")
print(endT - startT)

#print(os.environ["sandbox"])

#print(len(sys.argv))

# print(sys.argv[0])
# hostname = sys.argv[1]
# port = int(sys.argv[2])

# def netcat(hostname, port, content):
#     s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
#     s.connect((hostname, port))
#     print("hostname " + hostname)
#     s.sendall(content)
#     s.shutdown(socket.SHUT_WR)

#     res = ""

#     while 1:
#         data = s.recv(1024)
#         if (not data):
#             break
#         res += data.decode()

#     print(res)

#     print("Connection closed.")
#     s.close()

# while 1:
#     buf = ""
#     shouldClose = False

#     #get the request
#     inp = input("")
#     while inp != "":
#         if (inp == "Connection: close"):
#             shouldClose = True
#         buf += inp + "\n"
#         inp = input("")
#     buf += "\n"

#     #send request
#     netcat(hostname, port, buf.encode())

#     if (shouldClose):
#         break


